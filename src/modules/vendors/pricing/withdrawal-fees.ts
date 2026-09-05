/**
 * Frais de retrait vendeur — barèmes réels (Togo).
 *
 * 1) FedaPay payout (« envoi d’argent ») — fedapay.com/pricing
 * 2) Retrait cash agent Flooz (Moov) — moov-africa.tg
 * 3) Retrait cash agent Mixx by Yas (ex T-Money) — grille janv. 2025
 *
 * Paliers produit Kabakaba (qui paie quoi) :
 * - < 10 000  : vendeur paie les frais FedaPay (débités de son solde)
 * - 10k–29 999 : plateforme paie FedaPay ; vendeur reçoit exactement le montant demandé
 * - ≥ 30 000  : plateforme paie FedaPay + ajoute les frais retrait cash de l’opérateur
 *               (montant payout = demandé + frais cash)
 */

export type MobileOperator = 'FLOOZ' | 'MIXX';
export type WithdrawalTier = 'UNDER_10K' | 'FROM_10K_TO_30K' | 'FROM_30K';

export const KABAKABA_TIER_LOW = 10_000;
export const KABAKABA_TIER_HIGH = 30_000;

/** Barème FedaPay payout (montant → frais). */
const FEDAPAY_PAYOUT_BRACKETS: Array<{ max: number; fee: number }> = [
  { max: 10_000, fee: 150 },
  { max: 50_000, fee: 300 },
  { max: 150_000, fee: 800 },
  { max: 500_000, fee: 2_000 },
  { max: Infinity, fee: 2_500 },
];

/** Retrait cash Flooz (Moov Togo). */
const FLOOZ_CASH_BRACKETS: Array<{ max: number; fee: number }> = [
  { max: 500, fee: 50 },
  { max: 1_000, fee: 75 },
  { max: 5_000, fee: 100 },
  { max: 15_000, fee: 280 },
  { max: 20_000, fee: 320 },
  { max: 50_000, fee: 600 },
  { max: 100_000, fee: 1_000 },
  { max: 200_000, fee: 3_300 },
  { max: 300_000, fee: 4_000 },
  { max: 500_000, fee: 4_300 },
  { max: Infinity, fee: 5_000 },
];

/** Retrait cash Mixx by Yas (ex T-Money). */
const MIXX_CASH_BRACKETS: Array<{ max: number; fee: number }> = [
  { max: 500, fee: 50 },
  { max: 5_000, fee: 100 },
  { max: 20_000, fee: 300 },
  { max: 50_000, fee: 600 },
  { max: 100_000, fee: 1_000 },
  { max: 200_000, fee: 3_100 },
  { max: 300_000, fee: 3_700 },
  { max: 500_000, fee: 4_200 },
  { max: 850_000, fee: 4_400 },
  { max: Infinity, fee: 5_100 },
];

function feeFromBrackets(amount: number, brackets: Array<{ max: number; fee: number }>): number {
  const a = Math.max(0, Number(amount) || 0);
  for (const b of brackets) {
    if (a <= b.max) return b.fee;
  }
  return brackets[brackets.length - 1].fee;
}

export function fedapayPayoutFee(amountFcfa: number): number {
  return feeFromBrackets(amountFcfa, FEDAPAY_PAYOUT_BRACKETS);
}

export function cashOutFee(amountFcfa: number, operator: MobileOperator): number {
  const brackets = operator === 'FLOOZ' ? FLOOZ_CASH_BRACKETS : MIXX_CASH_BRACKETS;
  return feeFromBrackets(amountFcfa, brackets);
}

export interface WithdrawalFeeBreakdown {
  tier: WithdrawalTier;
  operator: MobileOperator;
  /** Montant demandé par le vendeur (ce qu’il veut « avoir »). */
  amountRequested: number;
  /** Frais FedaPay payout pour ce montant. */
  fedapayFee: number;
  /** Frais retrait cash agent (0 hors palier ≥ 30k). */
  cashOutFee: number;
  /**
   * Montant à envoyer dans le payout FedaPay (arrivé sur Flooz/Mixx).
   * - < 30k : = amountRequested
   * - ≥ 30k : amountRequested + cashOutFee
   */
  payoutAmountToSend: number;
  /** Débit sur balanceFcfa vendeur. */
  debitedFromBalance: number;
  /** Part des frais FedaPay à la charge du vendeur (palier < 10k seulement). */
  vendorBorneFedapayFee: number;
  /** Coût plateforme (FedaPay absorbé + cash ajouté). */
  platformCost: number;
  summaryLines: string[];
}

/**
 * Calcule le récap d’un retrait.
 * `amountRequested` = ce que le vendeur saisit dans l’app.
 * `operator` = FLOOZ | MIXX (réseau de réception).
 */
export function computeWithdrawalFees(
  amountRequested: number,
  operator: MobileOperator = 'MIXX',
): WithdrawalFeeBreakdown {
  const amount = Math.floor(Number(amountRequested));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Montant invalide');
  }

  const fedapayFee = fedapayPayoutFee(amount);
  const opCash = cashOutFee(amount, operator);

  if (amount < KABAKABA_TIER_LOW) {
    // Vendeur paie FedaPay : on débite montant + frais de son solde ;
    // le payout envoie le montant demandé ; FedaPay prélève ses frais sur la caisse marchand.
    return {
      tier: 'UNDER_10K',
      operator,
      amountRequested: amount,
      fedapayFee,
      cashOutFee: 0,
      payoutAmountToSend: amount,
      debitedFromBalance: amount + fedapayFee,
      vendorBorneFedapayFee: fedapayFee,
      platformCost: 0,
      summaryLines: [
        `Montant demandé : ${amount} FCFA`,
        `Frais FedaPay (à votre charge) : ${fedapayFee} FCFA`,
        `Débit de votre solde : ${amount + fedapayFee} FCFA`,
        `Vous recevrez sur ${operator === 'FLOOZ' ? 'Flooz' : 'Mixx'} : ${amount} FCFA`,
      ],
    };
  }

  if (amount < KABAKABA_TIER_HIGH) {
    // Plateforme paie FedaPay ; vendeur reçoit exactement le montant.
    return {
      tier: 'FROM_10K_TO_30K',
      operator,
      amountRequested: amount,
      fedapayFee,
      cashOutFee: 0,
      payoutAmountToSend: amount,
      debitedFromBalance: amount,
      vendorBorneFedapayFee: 0,
      platformCost: fedapayFee,
      summaryLines: [
        `Montant demandé : ${amount} FCFA`,
        `Frais FedaPay (pris en charge par Kabakaba) : ${fedapayFee} FCFA`,
        `Débit de votre solde : ${amount} FCFA`,
        `Vous recevrez sur ${operator === 'FLOOZ' ? 'Flooz' : 'Mixx'} : ${amount} FCFA`,
      ],
    };
  }

  // ≥ 30k : plateforme paie FedaPay + ajoute frais cash agent.
  const payoutAmountToSend = amount + opCash;
  return {
    tier: 'FROM_30K',
    operator,
    amountRequested: amount,
    fedapayFee,
    cashOutFee: opCash,
    payoutAmountToSend,
    debitedFromBalance: amount,
    vendorBorneFedapayFee: 0,
    platformCost: fedapayFee + opCash,
    summaryLines: [
      `Montant demandé : ${amount} FCFA`,
      `Frais FedaPay (Kabakaba) : ${fedapayFee} FCFA`,
      `Frais retrait cash ${operator === 'FLOOZ' ? 'Flooz' : 'Mixx'} (ajoutés par Kabakaba) : ${opCash} FCFA`,
      `Débit de votre solde : ${amount} FCFA`,
      `Vous recevrez sur ${operator === 'FLOOZ' ? 'Flooz' : 'Mixx'} : ${payoutAmountToSend} FCFA`,
    ],
  };
}

/** Coût plateforme pour analytics (compat). */
export function platformCoveredWithdrawalFee(
  amount: number,
  platformFee: number,
  operatorFee: number,
): number {
  // platformFee stocké = cashOut, operatorFee stocké = fedapay
  void amount;
  return Number(platformFee || 0) + Number(operatorFee || 0);
}
