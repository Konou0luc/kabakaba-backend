/**
 * CDC 5.3 — frais de retrait vendeur.
 *
 * Seuils :
 * - < 10 000 FCFA : vendeur paie frais plateforme + frais opérateur
 * - 10 000 – 29 999 : plateforme couvre frais plateforme ; vendeur paie opérateur
 * - ≥ 30 000 : plateforme couvre les deux
 *
 * Montants unitaires : non chiffrés explicitement dans le CDC — constantes
 * provisoires alignées sur l'ordre de grandeur des frais de recharge.
 * À ajuster sans toucher la logique de seuils.
 */
export const WITHDRAWAL_PLATFORM_FEE_FCFA = 100;
export const WITHDRAWAL_OPERATOR_FEE_FCFA = 100;

export const WITHDRAWAL_THRESHOLD_PLATFORM_COVERS = 10_000;
export const WITHDRAWAL_THRESHOLD_FULL_COVER = 30_000;

export interface WithdrawalFeeBreakdown {
  /** Frais plateforme nominaux (toujours enregistrés sur le Withdrawal). */
  platformFee: number;
  /** Frais opérateur nominaux (toujours enregistrés sur le Withdrawal). */
  operatorFee: number;
  /** Part réellement à la charge du vendeur (débitée du solde). */
  vendorBorneTotal: number;
  /** Part absorbée par la plateforme (coût analytics). */
  platformCoveredTotal: number;
}

/**
 * Calcule la répartition des frais pour un montant de retrait demandé.
 */
export function computeWithdrawalFees(
  amountFcfa: number,
  platformFee: number = WITHDRAWAL_PLATFORM_FEE_FCFA,
  operatorFee: number = WITHDRAWAL_OPERATOR_FEE_FCFA,
): WithdrawalFeeBreakdown {
  const amount = Number(amountFcfa);
  if (amount >= WITHDRAWAL_THRESHOLD_FULL_COVER) {
    return {
      platformFee,
      operatorFee,
      vendorBorneTotal: 0,
      platformCoveredTotal: platformFee + operatorFee,
    };
  }
  if (amount >= WITHDRAWAL_THRESHOLD_PLATFORM_COVERS) {
    return {
      platformFee,
      operatorFee,
      vendorBorneTotal: operatorFee,
      platformCoveredTotal: platformFee,
    };
  }
  return {
    platformFee,
    operatorFee,
    vendorBorneTotal: platformFee + operatorFee,
    platformCoveredTotal: 0,
  };
}

/**
 * Coût plateforme pour analytics (frais que la plateforme absorbe).
 * CDC 5.3 — inverse de ce que paie le vendeur.
 */
export function platformCoveredWithdrawalFee(
  amount: number,
  platformFee: number,
  operatorFee: number,
): number {
  return computeWithdrawalFees(amount, platformFee, operatorFee).platformCoveredTotal;
}
