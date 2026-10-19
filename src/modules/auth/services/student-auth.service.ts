import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationType, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/services/prisma.service';
import { sanitize } from '../../users/services/users.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { AuthService } from './auth.service';
import { StudentSetPinDto } from '../dto/student-set-pin.dto';
import { StudentLoginPinDto } from '../dto/student-login-pin.dto';
import {
  STUDENT_PIN_LENGTH,
  STUDENT_PIN_LOCK_MS,
  STUDENT_PIN_MAX_ATTEMPTS,
  STUDENT_PIN_SETUP_TOKEN_TTL,
  STUDENT_SCOPE_PIN_SETUP,
} from '../constants/student-pin.constants';

/**
 * Authentification PIN de l’application étudiant (PWA / mobile).
 *
 *  1. Première connexion (ou PIN oublié) : OTP SMS → pose / reset du PIN.
 *     Les tokens de session ne sont émis qu’après set-pin.
 *  2. Connexions suivantes : téléphone + PIN (sans SMS).
 */
@Injectable()
export class StudentAuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Appelé par AuthService.verifyOtp après validation OTP d’un étudiant. */
  async issuePinSetupGrant(userId: string, phone: string) {
    return {
      stage: 'PIN_SETUP_REQUIRED' as const,
      pinSetupToken: await this.signStepToken(userId, STUDENT_SCOPE_PIN_SETUP),
      pinLength: STUDENT_PIN_LENGTH,
      phoneMasked: maskPhone(phone),
    };
  }

  async setPin(dto: StudentSetPinDto) {
    const userId = await this.verifyStepToken(
      dto.pinSetupToken,
      STUDENT_SCOPE_PIN_SETUP,
    );
    const user = await this.loadStudentUser(userId);

    assertPinIsNotTrivial(dto.pin);

    const firstName = dto.firstName?.trim() || '';
    const lastName = dto.lastName?.trim() || '';
    const profileIncomplete =
      !user.firstName?.trim() || !user.lastName?.trim();

    // 1ʳᵉ inscription : prénom + nom obligatoires avant d’ouvrir la session.
    if (profileIncomplete && (!firstName || !lastName)) {
      throw new BadRequestException(
        'Le prénom et le nom sont obligatoires pour finaliser ton inscription.',
      );
    }

    const pinHash = await bcrypt.hash(this.pepperPin(dto.pin), 10);

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id: user.id },
        data: {
          pinHash,
          pinUpdatedAt: new Date(),
          pinFailedAttempts: 0,
          pinLockedUntil: null,
          ...(profileIncomplete
            ? { firstName, lastName }
            : firstName && lastName
              ? { firstName, lastName }
              : {}),
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revoked: false },
        data: { revoked: true },
      });
      return next;
    });

    return this.openSession(updated);
  }

  async loginPin(dto: StudentLoginPinDto) {
    const { phone, pin } = dto;
    const user = await this.prisma.user.findUnique({ where: { phone } });

    const invalid = new UnauthorizedException(
      'Numéro de téléphone ou code PIN invalide',
    );
    if (!user || user.role !== UserRole.STUDENT || !user.pinHash) throw invalid;

    this.assertAccountUsable(user);

    if (user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()) {
      throw this.lockedException(user.pinLockedUntil);
    }

    if (!(await bcrypt.compare(this.pepperPin(pin), user.pinHash))) {
      const remaining = await this.registerPinFailure(user.id);
      throw new UnauthorizedException(
        `Code PIN invalide. Il te reste ${remaining} ${remaining > 1 ? 'essais' : 'essai'} avant blocage temporaire.`,
      );
    }

    if (user.pinFailedAttempts !== 0 || user.pinLockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { pinFailedAttempts: 0, pinLockedUntil: null },
      });
    }

    return this.openSession(user);
  }

  private async openSession(user: { id: string; role: UserRole }) {
    const tokens = await this.authService.issueTokens(user.id, user.role);
    await this.authService.persistRefreshToken(
      user.id,
      tokens.refreshToken,
      undefined,
      tokens.refreshExpiresIn,
    );
    await this.notifyWelcome(user.id);
    return {
      user: sanitize(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  /** Bienvenue à chaque ouverture de session (PIN / set-pin). Ne bloque jamais le login. */
  private async notifyWelcome(userId: string) {
    try {
      await this.notifications.notifyUser(
        userId,
        'Bienvenue sur kabakaba',
        'Content de te revoir. Bon appétit sur le campus !',
        NotificationType.INFO,
        { kind: 'WELCOME', channelId: 'kabakaba_default' },
      );
    } catch {
      /* ignore — la session est déjà ouverte */
    }
  }

  private assertAccountUsable(user: {
    deletedAt: Date | null;
    isSuspended: boolean;
    suspensionUntil: Date | null;
    suspensionReason: string | null;
  }) {
    if (user.deletedAt) {
      throw new ForbiddenException(
        'Ce compte a été désactivé. Contacte le support kabakaba.',
      );
    }
    const suspensionActive =
      user.isSuspended &&
      (!user.suspensionUntil || user.suspensionUntil.getTime() > Date.now());
    if (suspensionActive) {
      throw new ForbiddenException(
        user.suspensionReason
          ? `Compte suspendu : ${user.suspensionReason}`
          : 'Ce compte est actuellement suspendu.',
      );
    }
  }

  private async loadStudentUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== UserRole.STUDENT || !user.phone) {
      throw new UnauthorizedException(
        'Session expirée ou invalide. Recommence la connexion.',
      );
    }
    this.assertAccountUsable(user);
    return { ...user, phone: user.phone };
  }

  private async registerPinFailure(userId: string) {
    const { pinFailedAttempts } = await this.prisma.user.update({
      where: { id: userId },
      data: { pinFailedAttempts: { increment: 1 } },
      select: { pinFailedAttempts: true },
    });

    if (pinFailedAttempts >= STUDENT_PIN_MAX_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + STUDENT_PIN_LOCK_MS);
      await this.prisma.user.update({
        where: { id: userId },
        data: { pinFailedAttempts: 0, pinLockedUntil: lockedUntil },
      });
      throw this.lockedException(lockedUntil);
    }

    return STUDENT_PIN_MAX_ATTEMPTS - pinFailedAttempts;
  }

  private lockedException(lockedUntil: Date) {
    const minutes = Math.max(
      1,
      Math.ceil((lockedUntil.getTime() - Date.now()) / 60000),
    );
    return new ForbiddenException(
      `Trop de codes PIN incorrects. Réessaie dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
    );
  }

  private signStepToken(userId: string, scope: string) {
    return this.jwtService.signAsync(
      { sub: userId, scope },
      {
        secret: this.stepTokenSecret(scope),
        expiresIn: STUDENT_PIN_SETUP_TOKEN_TTL,
      },
    );
  }

  private async verifyStepToken(token: string, scope: string): Promise<string> {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        scope: string;
      }>(token, { secret: this.stepTokenSecret(scope) });
      if (payload.scope !== scope || !payload.sub) throw new Error('scope');
      return payload.sub;
    } catch {
      throw new UnauthorizedException(
        'Étape de connexion expirée ou invalide. Recommence la connexion.',
      );
    }
  }

  private stepTokenSecret(scope: string) {
    return crypto
      .createHmac('sha256', this.requireAccessSecret())
      .update(`student-step-token:${scope}`)
      .digest('hex');
  }

  private pepperPin(pin: string) {
    return crypto
      .createHmac('sha256', this.requireAccessSecret())
      .update(`student-pin:${pin}`)
      .digest('hex');
  }

  private requireAccessSecret() {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_ACCESS_SECRET manquant — authentification étudiant indisponible',
      );
    }
    return secret;
  }
}

function assertPinIsNotTrivial(pin: string) {
  const digits = [...pin].map(Number);
  const allSame = digits.every((d) => d === digits[0]);
  const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
  const descending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);
  if (allSame || ascending || descending) {
    throw new BadRequestException(
      'Ce code PIN est trop simple. Évite les chiffres identiques ou en suite (0000, 1234, 4321…).',
    );
  }
}

function maskPhone(phone: string) {
  const visible = phone.slice(-2);
  return `${phone.slice(0, 4)} •• •• •• ${visible}`;
}
