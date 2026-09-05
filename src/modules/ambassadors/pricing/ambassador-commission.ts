import { AmbassadorLevel } from '@prisma/client';

/**
 * CDC 10.3 — taux de commission selon le niveau actif au moment de la recharge.
 * Base de calcul = montant payé par l'affilié (amountFcfa), pas les tickets reçus.
 */
export const COMMISSION_RATE_BY_LEVEL: Record<AmbassadorLevel, number> = {
  BRONZE: 0.005,
  SILVER: 0.008,
  GOLD: 0.012,
};

/**
 * CDC 10.3 — seuils de volume affiliés (somme amountFcfa SUCCESS sur 30 jours glissants).
 * Bronze : 0 – 49 999
 * Argent : 50 000 – 149 999
 * Or     : 150 000 et plus
 */
export const LEVEL_VOLUME_THRESHOLDS = {
  SILVER: 50_000,
  GOLD: 150_000,
} as const;

/** CDC 10.5 — inactivité de parrainage (nouveaux affiliés). */
export const AMBASSADOR_INACTIVITY = {
  WARNING_DAYS: 60,
  SUSPENSION_DAYS: 90,
} as const;

/**
 * Calcule le niveau à partir du volume 30 jours (montée et descente sans grâce).
 */
export function levelFromVolume(volumeFcfa: number): AmbassadorLevel {
  if (volumeFcfa >= LEVEL_VOLUME_THRESHOLDS.GOLD) return AmbassadorLevel.GOLD;
  if (volumeFcfa >= LEVEL_VOLUME_THRESHOLDS.SILVER) return AmbassadorLevel.SILVER;
  return AmbassadorLevel.BRONZE;
}

/**
 * Commission en tickets (1 FCFA de commission = 1 ticket).
 * Arrondi au plus proche pour coller aux exemples du tableau CDC 10.4.
 */
export function computeCommissionTickets(amountFcfa: number, level: AmbassadorLevel): number {
  const rate = COMMISSION_RATE_BY_LEVEL[level] ?? 0;
  if (rate <= 0 || amountFcfa <= 0) return 0;
  return Math.round(Number(amountFcfa) * rate);
}
