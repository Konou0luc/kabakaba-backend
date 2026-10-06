import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/services/prisma.service';
import { sanitize } from '../../users/services/users.service';
import { AuthService } from './auth.service';
import { VendorActivateStartDto } from '../dto/vendor-activate-start.dto';
import { VendorActivateVerifyOtpDto } from '../dto/vendor-activate-verify-otp.dto';
import { VendorSetPinDto } from '../dto/vendor-set-pin.dto';
import { VendorLoginPinDto } from '../dto/vendor-login-pin.dto';
import { VendorResendOtpDto } from '../dto/vendor-resend-otp.dto';
import {
  VENDOR_ONBOARDING_TOKEN_TTL,
  VENDOR_PIN_LENGTH,
  VENDOR_PIN_LOCK_MS,
  VENDOR_PIN_MAX_ATTEMPTS,
  VENDOR_SCOPE_ONBOARDING,
  VENDOR_SCOPE_PIN_SETUP,
} from '../constants/vendor-pin.constants';

/**
 * Authentification de l'application vendeur mobile.
 *
 * Deux parcours, conformes à la maquette « connexion vendeur » :
 *
 *  1. Activation (première connexion, ou réinitialisation d'un PIN oublié)
 *     téléphone + mot de passe → OTP SMS → création du code PIN.
 *     Chaque étape ne délivre qu'un jeton d'étape à portée limitée ; les
 *     tokens de session ne sont émis qu'une fois le PIN posé.
 *
 *  2. Connexions suivantes : téléphone + PIN.
 *
 * Le mot de passe (temporaire, créé par un administrateur avec le compte)
 * n'est donc plus saisi au quotidien : il ne sert qu'à autoriser la pose d'un
 * nouveau PIN. C'est aussi le seul chemin de récupération, ce qui évite qu'un
 * simple accès à la carte SIM suffise à reprendre la main sur une cantine.
 */
@Injectable()
export class VendorAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async activateStart(dto: VendorActivateStartDto) {
    const { phone, password } = dto;

    const user = await this.prisma.user.findUnique({ where: { phone } });

    // Message volontairement identique pour « numéro inconnu », « compte non
    // vendeur » et « mot de passe faux » : l'écran de connexion ne doit pas
    // permettre d'énumérer les comptes vendeur.
    const invalid = new UnauthorizedException(
      'Numéro de téléphone ou mot de passe invalide',
    );
    if (!user || !user.password || user.role !== UserRole.VENDOR) throw invalid;
    if (!(await bcrypt.compare(password, user.password))) throw invalid;

    this.assertAccountUsable(user);

    const vendor = await this.prisma.vendor.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: { id: true, isActive: true },
    });
    if (!vendor) {
      throw new ForbiddenException(
        "Aucune cantine n'est rattachée à ce compte. Contacte un administrateur kabakaba.",
      );
    }

    // L'OTP n'est envoyé qu'après validation complète des identifiants, pour
    // ne pas transformer cette route en générateur de SMS gratuits.
    await this.authService.sendOtp({ phone });

    return {
      stage: 'OTP_REQUIRED' as const,
      onboardingToken: await this.signStepToken(
        user.id,
        VENDOR_SCOPE_ONBOARDING,
      ),
      phoneMasked: maskPhone(phone),
      pinLength: VENDOR_PIN_LENGTH,
    };
  }

  /**
   * Renvoie un SMS sans redemander le mot de passe : le jeton d'étape suffit
   * à prouver que l'étape 1 a été franchie. Évite au client mobile de garder
   * le mot de passe en mémoire juste pour alimenter un bouton « renvoyer ».
   *
   * Un jeton rafraîchi est retourné pour que le compte à rebours de l'étape
   * reparte en même temps que celui du nouveau code.
   */
  async resendActivationOtp(dto: VendorResendOtpDto) {
    const userId = await this.verifyStepToken(
      dto.onboardingToken,
      VENDOR_SCOPE_ONBOARDING,
    );
    const user = await this.loadVendorUser(userId);

    await this.authService.sendOtp({ phone: user.phone });

    return {
      stage: 'OTP_REQUIRED' as const,
      onboardingToken: await this.signStepToken(
        user.id,
        VENDOR_SCOPE_ONBOARDING,
      ),
      phoneMasked: maskPhone(user.phone),
      pinLength: VENDOR_PIN_LENGTH,
    };
  }

  async activateVerifyOtp(dto: VendorActivateVerifyOtpDto) {
    const userId = await this.verifyStepToken(
      dto.onboardingToken,
      VENDOR_SCOPE_ONBOARDING,
    );
    const user = await this.loadVendorUser(userId);

    await this.authService.consumeOtp(user.phone, dto.code);

    return {
      stage: 'PIN_SETUP_REQUIRED' as const,
      pinSetupToken: await this.signStepToken(user.id, VENDOR_SCOPE_PIN_SETUP),
      pinLength: VENDOR_PIN_LENGTH,
    };
  }

  async setPin(dto: VendorSetPinDto) {
    const userId = await this.verifyStepToken(
      dto.pinSetupToken,
      VENDOR_SCOPE_PIN_SETUP,
    );
    const user = await this.loadVendorUser(userId);

    assertPinIsNotTrivial(dto.pin);

    const pinHash = await bcrypt.hash(this.pepperPin(dto.pin), 10);

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id: user.id },
        data: {
          pinHash,
          pinUpdatedAt: new Date(),
          pinFailedAttempts: 0,
          pinLockedUntil: null,
          // Le mot de passe temporaire a joué son rôle : le compte est
          // désormais piloté par son PIN, plus rien n'est « à changer ».
          mustChangePassword: false,
        },
      });
      // Poser un PIN équivaut à un changement de mot de passe : toutes les
      // sessions ouvertes ailleurs sont invalidées.
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revoked: false },
        data: { revoked: true },
      });
      return next;
    });

    return this.openSession(updated);
  }

  async loginPin(dto: VendorLoginPinDto) {
    const { phone, pin } = dto;

    const user = await this.prisma.user.findUnique({ where: { phone } });

    const invalid = new UnauthorizedException(
      'Numéro de téléphone ou code PIN invalide',
    );
    if (!user || user.role !== UserRole.VENDOR || !user.pinHash) throw invalid;

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

    // Succès : on repart d'un compteur vierge, sinon des échecs espacés dans
    // le temps finiraient par verrouiller un vendeur légitime.
    if (user.pinFailedAttempts !== 0 || user.pinLockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { pinFailedAttempts: 0, pinLockedUntil: null },
      });
    }

    return this.openSession(user);
  }

  private async openSession(user: {
    id: string;
    role: UserRole;
    password?: string | null;
  }) {
    const tokens = await this.authService.issueTokens(user.id, user.role);
    await this.authService.persistRefreshToken(user.id, tokens.refreshToken);

    const vendor = await this.prisma.vendor.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: { id: true, canteenName: true, isActive: true, isOpen: true },
    });

    return { user: sanitize(user), vendor, ...tokens };
  }

  private assertAccountUsable(user: {
    deletedAt: Date | null;
    isSuspended: boolean;
    suspensionUntil: Date | null;
    suspensionReason: string | null;
  }) {
    if (user.deletedAt) {
      throw new ForbiddenException(
        'Ce compte a été désactivé. Contacte un administrateur kabakaba.',
      );
    }

    // Une suspension expirée est levée par JwtStrategy à la première requête
    // authentifiée ; ici on ne bloque que les suspensions encore actives,
    // pour ne pas refuser la connexion d'un compte en réalité déjà libéré.
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

  private async loadVendorUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== UserRole.VENDOR || !user.phone) {
      throw new UnauthorizedException(
        'Session d’activation invalide, recommence la connexion',
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

    if (pinFailedAttempts >= VENDOR_PIN_MAX_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + VENDOR_PIN_LOCK_MS);
      await this.prisma.user.update({
        where: { id: userId },
        data: { pinFailedAttempts: 0, pinLockedUntil: lockedUntil },
      });
      throw this.lockedException(lockedUntil);
    }

    return VENDOR_PIN_MAX_ATTEMPTS - pinFailedAttempts;
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
        expiresIn: VENDOR_ONBOARDING_TOKEN_TTL,
      },
    );
  }

  private async verifyStepToken(token: string, scope: string): Promise<string> {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        scope: string;
      }>(token, {
        secret: this.stepTokenSecret(scope),
      });
      if (payload.scope !== scope || !payload.sub) throw new Error('scope');
      return payload.sub;
    } catch {
      throw new UnauthorizedException(
        'Étape de connexion expirée ou invalide. Recommence la connexion.',
      );
    }
  }

  /**
   * Clé de signature propre à chaque étape, dérivée du secret d'accès. Deux
   * bénéfices : aucune variable d'environnement supplémentaire à provisionner,
   * et un jeton d'une étape ne peut pas être présenté à l'étape suivante
   * (clés différentes) ni servir de token d'accès (secret différent).
   */
  private stepTokenSecret(scope: string) {
    return crypto
      .createHmac('sha256', this.requireAccessSecret())
      .update(`vendor-step-token:${scope}`)
      .digest('hex');
  }

  /**
   * « Poivre » appliqué au PIN avant bcrypt. Un PIN à 4 chiffres ne vaut que
   * 10 000 combinaisons : sans ce HMAC à clé serveur, une fuite de la table
   * User permettrait de retrouver tous les PIN hors ligne en quelques
   * secondes, bcrypt ou pas.
   */
  private pepperPin(pin: string) {
    return crypto
      .createHmac('sha256', this.requireAccessSecret())
      .update(`vendor-pin:${pin}`)
      .digest('hex');
  }

  private requireAccessSecret() {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_ACCESS_SECRET manquant — authentification vendeur indisponible',
      );
    }
    return secret;
  }
}

/**
 * Refuse les PIN devinables en premier : ils représentent une part énorme des
 * codes réellement choisis, et un attaquant les essaie avant tout le reste.
 */
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
