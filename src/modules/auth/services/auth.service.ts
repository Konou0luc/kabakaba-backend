import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/services/prisma.service';
import { UsersService, sanitize } from '../../users/services/users.service';
import { SmsService } from '../../sms/services/sms.service';
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { LoginEmailDto } from '../dto/login-email.dto';
import * as bcrypt from 'bcrypt';
import { AmbassadorStatus, UserRole } from '@prisma/client';
import { safeErrorMessage } from '../../../common/utils/safe-log';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
  ) {}

  async sendOtp(sendOtpDto: SendOtpDto) {
    const { phone } = sendOtpDto;

    await this.prisma.otpCode.deleteMany({
      where: { phone, expiresAt: { lt: new Date() } },
    });

    const existingOtp = await this.prisma.otpCode.findFirst({
      where: { phone, used: false, expiresAt: { gt: new Date() } },
    });

    if (existingOtp && existingOtp.attempts >= 5) {
      throw new BadRequestException('Trop de tentatives, veuillez demander un nouveau code OTP');
    }

    // SÉCURITÉ : crypto.randomInt (CSPRNG) au lieu de Math.random() — un
    // code d'authentification ne doit jamais reposer sur un générateur
    // pseudo-aléatoire non cryptographique.
    const code = crypto.randomInt(100000, 1000000).toString();
    const hashedCode = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    if (existingOtp) {
      await this.prisma.otpCode.update({
        where: { id: existingOtp.id },
        data: {
          code: hashedCode,
          expiresAt,
          attempts: existingOtp.attempts + 1,
        },
      });
    } else {
      await this.prisma.otpCode.create({
        data: {
          phone,
          code: hashedCode,
          expiresAt,
        },
      });
    }

    try {
      await this.smsService.sendSms(
        phone,
        `Votre code de vérification Kabakaba est: ${code}`,
      );
    } catch (error) {
      console.error(`Erreur lors de l'envoi du SMS OTP: ${safeErrorMessage(error)}`);
    }

    return {
      message: 'Code OTP envoyé avec succès',
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { phone, code, referralCode, campusId } = verifyOtpDto;

    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, used: false, expiresAt: { gt: new Date() } },
    });

    if (!otp) {
      throw new BadRequestException('Code OTP invalide ou expiré');
    }

    // SÉCURITÉ : plafond de tentatives vérifié AVANT la comparaison — sans
    // ça, `attempts` n'était incrémenté qu'à la régénération d'un code,
    // jamais lors d'un échec de vérification, laissant un même code
    // brute-forçable sans limite pendant ses 5 minutes de validité.
    if (otp.attempts >= 5) {
      throw new BadRequestException('Trop de tentatives, veuillez demander un nouveau code OTP');
    }

    const isValid = await bcrypt.compare(code, otp.code);
    if (!isValid) {
      // Incrément atomique et conditionnel : deux requêtes concurrentes ne
      // peuvent pas réutiliser un même état d'OTP ni dépasser le plafond par
      // une lecture obsolète de `attempts`.
      const claimedFailure = await this.prisma.otpCode.updateMany({
        where: { id: otp.id, used: false, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
        data: { attempts: { increment: 1 } },
      });
      if (claimedFailure.count === 0) {
        throw new BadRequestException('Trop de tentatives, veuillez demander un nouveau code OTP');
      }
      throw new BadRequestException('Code OTP invalide ou expiré');
    }

    // Consommation atomique : une seule requête concurrente peut marquer
    // l'OTP comme utilisé et obtenir l'authentification.
    const claimed = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, used: false, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
      data: { used: true },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('Code OTP invalide ou expiré');
    }

    let user = await this.usersService.findByPhone(phone);

    if (!user) {
      // CDC 2.1 [NOUVEAU v1.1] : le code de parrainage n'a de sens qu'à la
      // toute première inscription — un compte déjà existant qui se
      // reconnecte ignore silencieusement ce champ (voir plus bas, hors de
      // ce bloc). Trim d'abord : un champ laissé vide côté mobile arrive
      // souvent comme "" plutôt qu'absent, et ne doit pas être traité comme
      // un code invalide.
      const trimmedReferralCode = referralCode?.trim();

      user = await this.prisma.$transaction(async (tx) => {
        let ambassador: { id: string } | null = null;

        if (trimmedReferralCode) {
          // SÉCURITÉ / RÈGLE MÉTIER (CDC 10.1) : le code personnel n'existe
          // qu'à l'acceptation de la demande par l'Admin web. Un candidat
          // peut proposer un code dès sa demande (choix produit), mais tant
          // que sa candidature n'est pas ACTIVE, ce code ne doit affilier
          // personne — sinon un candidat en attente (ou refusé) collecterait
          // des affiliés avant toute validation. Filtrer sur status: ACTIVE
          // plutôt que sur la simple existence du promoCode.
          ambassador = await tx.ambassador.findFirst({
            where: { promoCode: trimmedReferralCode, status: AmbassadorStatus.ACTIVE },
            select: { id: true },
          });
          if (!ambassador) {
            throw new BadRequestException('Code de parrainage invalide ou inexistant');
          }
        }

        // CDC 2.1 — campus obligatoire à la première inscription.
        if (!campusId?.trim()) {
          throw new BadRequestException(
            'Le campus est obligatoire à l\'inscription. Veuillez sélectionner votre campus.',
          );
        }
        const campus = await tx.campus.findFirst({
          where: { id: campusId, deletedAt: null },
        });
        if (!campus) {
          throw new BadRequestException('Campus invalide ou inexistant');
        }

        const createdUser = await tx.user.create({
          data: {
            phone,
            role: UserRole.STUDENT,
            campusId: campus.id,
          },
        });

        if (ambassador) {
          // Affiliation définitive : aucun endpoint n'existe pour modifier
          // ou supprimer une AmbassadorAffiliate une fois créée (voir CDC
          // 2.1 — "il n'est plus possible d'ajouter, modifier ou retirer un
          // code de parrainage après coup").
          await tx.ambassadorAffiliate.create({
            data: {
              ambassadorId: ambassador.id,
              studentId: createdUser.id,
            },
          });
          // CDC 10.5 — lastReferralAt sert au calcul d'inactivité de
          // parrainage (avertissement 2 mois, suspension 3 mois).
          await tx.ambassador.update({
            where: { id: ambassador.id },
            data: { lastReferralAt: new Date() },
          });
        }

        return createdUser;
      });
    }

    const tokens = await this.getTokens(user.id, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      user: sanitize(user),
      ...tokens,
    };
  }

  async loginEmail(loginEmailDto: LoginEmailDto) {
    const { email, password } = loginEmailDto;

    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Identifiants invalides');

    if (!user.password) throw new UnauthorizedException('Veuillez utiliser la connexion par téléphone');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Identifiants invalides');

    const tokens = await this.getTokens(user.id, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      user: sanitize(user),
      ...tokens,
    };
  }

  /**
   * Flux "mot de passe temporaire → mot de passe personnel" : requis pour
   * tout compte créé par un admin avec User.mustChangePassword=true (ex :
   * vendeur créé via POST /vendors). Vérifie l'ancien mot de passe avant
   * d'accepter le nouveau, comme n'importe quel changement de mot de passe.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!user.password) throw new UnauthorizedException('Ce compte ne peut pas changer de mot de passe');

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) throw new UnauthorizedException('Mot de passe actuel incorrect');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword, mustChangePassword: false },
      }),
      // Invalidation globale des refresh tokens après changement de mot de passe.
      this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      }),
    ]);

    return { success: true };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const decoded = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
        include: { refreshTokens: true },
      });

      if (!user) throw new UnauthorizedException();

      // hashedToken est un hash bcrypt (salé) : impossible de le comparer
      // via une clause WHERE, on compare donc candidat par candidat parmi
      // les tokens non expirés de cet utilisateur (révoqués INCLUS, pour
      // pouvoir détecter une réutilisation — voir plus bas).
      const candidates = user.refreshTokens.filter((rt) => rt.expiresAt > new Date());

      let matched: (typeof candidates)[number] | null = null;
      for (const rt of candidates) {
        if (await bcrypt.compare(refreshToken, rt.hashedToken)) {
          matched = rt;
          break;
        }
      }

      if (!matched) throw new UnauthorizedException();

      if (matched.revoked) {
        // SÉCURITÉ : ce refresh token a déjà été consommé une fois (rotation
        // précédente). Le revoir signifie soit un double-clic client, soit —
        // plus grave — qu'il a été volé et qu'un attaquant tente de
        // l'utiliser après (ou avant) le titulaire légitime. Dans le doute,
        // on tue toute la famille de tokens : la session entière doit se
        // reconnecter.
        await this.prisma.refreshToken.updateMany({
          where: { userId: user.id, familyId: matched.familyId, revoked: false },
          data: { revoked: true },
        });
        throw new UnauthorizedException('Session invalidée, veuillez vous reconnecter');
      }

      // SÉCURITÉ : claim ATOMIQUE — deux requêtes de refresh concurrentes
      // avec le même RT ne doivent produire qu'UN SEUL nouveau token. Le
      // `where: revoked: false` fait que seule la première requête à
      // atteindre la DB obtient count === 1 ; l'autre voit count === 0 et
      // doit se réauthentifier au lieu de recevoir un second token valide
      // issu du même RT consommé.
      const claim = await this.prisma.refreshToken.updateMany({
        where: { id: matched.id, revoked: false },
        data: { revoked: true },
      });

      if (claim.count === 0) {
        throw new UnauthorizedException('Token de renouvellement déjà utilisé, veuillez vous reconnecter');
      }

      const tokens = await this.getTokens(user.id, user.role);
      await this.updateRefreshToken(user.id, tokens.refreshToken, matched.familyId);

      return tokens;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Token de renouvellement invalide');
    }
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    return {
      message: 'Déconnexion réussie',
    };
  }

  private async getTokens(userId: string, role: UserRole) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, role },
        {
          secret: this.configService.get('JWT_ACCESS_SECRET'),
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, role },
        {
          secret: this.configService.get('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async updateRefreshToken(userId: string, refreshToken: string, familyId?: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Hygiène : purge les tokens déjà expirés de cet utilisateur à chaque
    // nouvelle émission, pour éviter que la table ne grossisse sans limite
    // et que refreshTokens() n'ait de plus en plus de bcrypt.compare() à
    // faire au fil du temps.
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });

    await this.prisma.refreshToken.create({
      data: {
        userId,
        hashedToken: hashedRefreshToken,
        expiresAt,
        // Si aucune famille n'est fournie (connexion initiale), le schéma
        // en génère une nouvelle via @default(uuid()).
        ...(familyId ? { familyId } : {}),
      },
    });
  }
}
