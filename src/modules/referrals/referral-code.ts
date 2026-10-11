import { randomInt } from 'crypto';
import { InternalServerErrorException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REFERRAL_CODE_MAX_ATTEMPTS,
} from './referral.constants';

/** Tire un code au hasard (sans vérifier l'unicité). */
export function generateReferralCode(): string {
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Normalise un code saisi par l'utilisateur : espaces retirés, majuscules.
 * Renvoie une chaîne vide si rien n'a été saisi (le code est alors ignoré).
 */
export function normalizeReferralCode(input?: string | null): string {
  return (input ?? '').replace(/\s+/g, '').toUpperCase();
}

/**
 * Génère un code qui n'est porté par aucun compte, avec nouvel essai en cas de
 * collision. L'unicité est vérifiée AVANT l'insertion : une violation de la
 * contrainte unique au milieu d'une transaction PostgreSQL l'invaliderait
 * entièrement. À appeler avec le client de la transaction (`tx`) quand
 * l'utilisateur est créé dans une transaction.
 */
export async function generateUniqueReferralCode(
  client: Pick<Prisma.TransactionClient, 'user'>,
): Promise<string> {
  for (let attempt = 0; attempt < REFERRAL_CODE_MAX_ATTEMPTS; attempt++) {
    const code = generateReferralCode();
    const existing = await client.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new InternalServerErrorException(
    'Impossible de générer un code de parrainage unique',
  );
}
