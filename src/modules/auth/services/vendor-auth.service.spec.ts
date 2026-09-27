/// <reference types="jest" />
import 'reflect-metadata';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { VendorAuthService } from './vendor-auth.service';
import { AuthService } from './auth.service';
import { PrismaService } from '../../../database/services/prisma.service';
import { VENDOR_PIN_MAX_ATTEMPTS } from '../constants/vendor-pin.constants';

const ACCESS_SECRET = 'secret-de-test-pour-les-jetons';
const PHONE = '+22890000000';
const PASSWORD = 'MotDePasseTemporaire1';

type FakeUser = {
  id: string;
  phone: string | null;
  password: string | null;
  role: UserRole;
  pinHash: string | null;
  pinFailedAttempts: number;
  pinLockedUntil: Date | null;
  pinUpdatedAt: Date | null;
  mustChangePassword: boolean;
  isBanned: boolean;
  deletedAt: Date | null;
  isSuspended: boolean;
  suspensionUntil: Date | null;
  suspensionReason: string | null;
};

type FindUniqueArgs = { where: { id?: string; phone?: string } };

type UpdateArgs = {
  data: {
    pinHash?: string | null;
    pinFailedAttempts?: number | { increment: number };
    pinLockedUntil?: Date | null;
    pinUpdatedAt?: Date | null;
    mustChangePassword?: boolean;
  };
};

async function buildHarness(overrides: Partial<FakeUser> = {}) {
  const user: FakeUser = {
    id: 'user-1',
    phone: PHONE,
    password: await bcrypt.hash(PASSWORD, 4),
    role: UserRole.VENDOR,
    pinHash: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    pinUpdatedAt: null,
    mustChangePassword: true,
    isBanned: false,
    deletedAt: null,
    isSuspended: false,
    suspensionUntil: null,
    suspensionReason: null,
    ...overrides,
  };

  const revokeRefreshTokens = jest.fn().mockResolvedValue({ count: 2 });

  const findUnique = jest.fn(({ where }: FindUniqueArgs) => {
    const matches = where.id
      ? where.id === user.id
      : where.phone === user.phone;
    return Promise.resolve(matches ? { ...user } : null);
  });

  const update = jest.fn(({ data }: UpdateArgs) => {
    const attempts = data.pinFailedAttempts;
    if (typeof attempts === 'number') user.pinFailedAttempts = attempts;
    else if (attempts) user.pinFailedAttempts += attempts.increment;

    if (data.pinHash !== undefined) user.pinHash = data.pinHash;
    if (data.pinLockedUntil !== undefined)
      user.pinLockedUntil = data.pinLockedUntil;
    if (data.pinUpdatedAt !== undefined) user.pinUpdatedAt = data.pinUpdatedAt;
    if (data.mustChangePassword !== undefined) {
      user.mustChangePassword = data.mustChangePassword;
    }
    return Promise.resolve({ ...user });
  });

  const prisma = {
    user: { findUnique, update },
    vendor: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'vendor-1',
        canteenName: 'Cantine Test',
        isActive: true,
        isOpen: false,
      }),
    },
    refreshToken: { updateMany: revokeRefreshTokens },
    $transaction: (
      arg:
        | Promise<unknown>[]
        | ((tx: {
            user: { update: typeof update };
            refreshToken: { updateMany: typeof revokeRefreshTokens };
          }) => Promise<unknown>),
    ) => {
      if (typeof arg === 'function') {
        return arg({
          user: { update },
          refreshToken: { updateMany: revokeRefreshTokens },
        });
      }
      return Promise.all(arg);
    },
  } as unknown as PrismaService;

  const sendOtp = jest.fn().mockResolvedValue({ message: 'ok' });
  const consumeOtp = jest.fn().mockResolvedValue(undefined);
  const issueTokens = jest
    .fn()
    .mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });
  const persistRefreshToken = jest.fn().mockResolvedValue(undefined);

  const authService = {
    sendOtp,
    consumeOtp,
    issueTokens,
    persistRefreshToken,
  } as unknown as AuthService;

  const configService = {
    get: jest.fn().mockReturnValue(ACCESS_SECRET),
  } as unknown as ConfigService;

  const service = new VendorAuthService(
    prisma,
    authService,
    new JwtService({}),
    configService,
  );

  return { service, user, sendOtp, consumeOtp, revokeRefreshTokens };
}

describe('VendorAuthService — activation', () => {
  it('envoie un OTP et un jeton d’étape quand les identifiants sont bons', async () => {
    const { service, sendOtp } = await buildHarness();

    const result = await service.activateStart({
      phone: PHONE,
      password: PASSWORD,
    });

    expect(result.stage).toBe('OTP_REQUIRED');
    expect(result.onboardingToken).toBeTruthy();
    expect(sendOtp).toHaveBeenCalledWith({ phone: PHONE });
    // Le numéro complet ne doit pas repartir en clair vers le client.
    expect(result.phoneMasked).not.toContain('90000000');
  });

  it('ne révèle pas si l’échec vient du numéro ou du mot de passe', async () => {
    const wrongPassword = await buildHarness();
    const notAVendor = await buildHarness({ role: UserRole.STUDENT });

    const first = await wrongPassword.service
      .activateStart({ phone: PHONE, password: 'mauvais' })
      .catch((error: Error) => error.message);
    const second = await notAVendor.service
      .activateStart({ phone: PHONE, password: PASSWORD })
      .catch((error: Error) => error.message);

    expect(first).toBe(second);
  });

  it('n’envoie aucun SMS quand le mot de passe est faux', async () => {
    const { service, sendOtp } = await buildHarness();

    await expect(
      service.activateStart({ phone: PHONE, password: 'mauvais' }),
    ).rejects.toThrow();

    expect(sendOtp).not.toHaveBeenCalled();
  });

  it('refuse un compte banni', async () => {
    const { service } = await buildHarness({ isBanned: true });

    await expect(
      service.activateStart({ phone: PHONE, password: PASSWORD }),
    ).rejects.toThrow(/désactivé/);
  });

  it('refuse un compte encore sous suspension', async () => {
    const { service } = await buildHarness({
      isSuspended: true,
      suspensionUntil: new Date(Date.now() + 60_000),
      suspensionReason: 'Litiges répétés',
    });

    await expect(
      service.activateStart({ phone: PHONE, password: PASSWORD }),
    ).rejects.toThrow(/Litiges répétés/);
  });

  it('accepte un compte dont la suspension est expirée', async () => {
    const { service } = await buildHarness({
      isSuspended: true,
      suspensionUntil: new Date(Date.now() - 60_000),
    });

    await expect(
      service.activateStart({ phone: PHONE, password: PASSWORD }),
    ).resolves.toMatchObject({ stage: 'OTP_REQUIRED' });
  });
});

describe('VendorAuthService — jetons d’étape', () => {
  it('refuse un jeton d’activation présenté à l’étape de pose du PIN', async () => {
    const { service } = await buildHarness();

    const { onboardingToken } = await service.activateStart({
      phone: PHONE,
      password: PASSWORD,
    });

    // Les deux étapes sont signées avec des clés dérivées distinctes : un
    // jeton ne peut pas sauter l'étape OTP.
    await expect(
      service.setPin({ pinSetupToken: onboardingToken, pin: '4821' }),
    ).rejects.toThrow(/expirée ou invalide/);
  });

  it('refuse un jeton signé avec un autre secret', async () => {
    const { service } = await buildHarness();
    const forged = await new JwtService({}).signAsync(
      { sub: 'user-1', scope: 'vendor_pin_setup' },
      { secret: 'mauvais-secret', expiresIn: '10m' },
    );

    await expect(
      service.setPin({ pinSetupToken: forged, pin: '4821' }),
    ).rejects.toThrow(/expirée ou invalide/);
  });

  it('enchaîne activation → OTP → PIN et ouvre la session', async () => {
    const { service, consumeOtp, revokeRefreshTokens, user } =
      await buildHarness();

    const started = await service.activateStart({
      phone: PHONE,
      password: PASSWORD,
    });
    const verified = await service.activateVerifyOtp({
      onboardingToken: started.onboardingToken,
      code: '123456',
    });
    const session = await service.setPin({
      pinSetupToken: verified.pinSetupToken,
      pin: '4821',
    });

    expect(consumeOtp).toHaveBeenCalledWith(PHONE, '123456');
    expect(session.accessToken).toBe('access');
    expect(session.vendor).toMatchObject({ canteenName: 'Cantine Test' });
    // Poser un PIN vaut changement de mot de passe : les sessions ouvertes
    // ailleurs doivent tomber.
    expect(revokeRefreshTokens).toHaveBeenCalled();
    expect(user.mustChangePassword).toBe(false);
    expect((session.user as { password?: string }).password).toBeUndefined();
  });
});

describe('VendorAuthService — code PIN', () => {
  it.each(['0000', '1111', '1234', '4321'])(
    'refuse le PIN trop simple %s',
    async (pin) => {
      const { service } = await buildHarness();
      const started = await service.activateStart({
        phone: PHONE,
        password: PASSWORD,
      });
      const verified = await service.activateVerifyOtp({
        onboardingToken: started.onboardingToken,
        code: '123456',
      });

      await expect(
        service.setPin({ pinSetupToken: verified.pinSetupToken, pin }),
      ).rejects.toThrow(/trop simple/);
    },
  );

  it('stocke le PIN poivré, non devinable depuis la base seule', async () => {
    const { service, user } = await buildHarness();
    const started = await service.activateStart({
      phone: PHONE,
      password: PASSWORD,
    });
    const verified = await service.activateVerifyOtp({
      onboardingToken: started.onboardingToken,
      code: '123456',
    });
    await service.setPin({
      pinSetupToken: verified.pinSetupToken,
      pin: '4821',
    });

    expect(user.pinHash).toBeTruthy();
    // Sans le secret applicatif, tester les 10 000 PIN contre le hash ne
    // donne rien : le hash porte sur le HMAC du PIN, pas sur le PIN.
    await expect(bcrypt.compare('4821', user.pinHash as string)).resolves.toBe(
      false,
    );
  });

  it('connecte le vendeur avec le bon PIN', async () => {
    const { service } = await buildHarness();
    const started = await service.activateStart({
      phone: PHONE,
      password: PASSWORD,
    });
    const verified = await service.activateVerifyOtp({
      onboardingToken: started.onboardingToken,
      code: '123456',
    });
    await service.setPin({
      pinSetupToken: verified.pinSetupToken,
      pin: '4821',
    });

    await expect(
      service.loginPin({ phone: PHONE, pin: '4821' }),
    ).resolves.toMatchObject({
      accessToken: 'access',
    });
  });

  it('verrouille le PIN après trop d’échecs, puis refuse même le bon PIN', async () => {
    const { service, user } = await buildHarness();
    const started = await service.activateStart({
      phone: PHONE,
      password: PASSWORD,
    });
    const verified = await service.activateVerifyOtp({
      onboardingToken: started.onboardingToken,
      code: '123456',
    });
    await service.setPin({
      pinSetupToken: verified.pinSetupToken,
      pin: '4821',
    });

    for (let attempt = 1; attempt < VENDOR_PIN_MAX_ATTEMPTS; attempt++) {
      await expect(
        service.loginPin({ phone: PHONE, pin: '1357' }),
      ).rejects.toThrow(/Il te reste/);
    }

    await expect(
      service.loginPin({ phone: PHONE, pin: '1357' }),
    ).rejects.toThrow(/Réessaie dans/);
    expect(user.pinLockedUntil).toBeInstanceOf(Date);

    await expect(
      service.loginPin({ phone: PHONE, pin: '4821' }),
    ).rejects.toThrow(/Réessaie dans/);
  });

  it('remet le compteur à zéro après une connexion réussie', async () => {
    const { service, user } = await buildHarness();
    const started = await service.activateStart({
      phone: PHONE,
      password: PASSWORD,
    });
    const verified = await service.activateVerifyOtp({
      onboardingToken: started.onboardingToken,
      code: '123456',
    });
    await service.setPin({
      pinSetupToken: verified.pinSetupToken,
      pin: '4821',
    });

    await expect(
      service.loginPin({ phone: PHONE, pin: '1357' }),
    ).rejects.toThrow();
    expect(user.pinFailedAttempts).toBe(1);

    await service.loginPin({ phone: PHONE, pin: '4821' });
    expect(user.pinFailedAttempts).toBe(0);
  });

  it('refuse la connexion PIN si aucun PIN n’a été posé', async () => {
    const { service } = await buildHarness();

    await expect(
      service.loginPin({ phone: PHONE, pin: '4821' }),
    ).rejects.toThrow(/Numéro de téléphone ou code PIN invalide/);
  });
});
