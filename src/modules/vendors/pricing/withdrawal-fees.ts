/**
 * Retrait vendeur.
 *
 * Le solde n’est jamais débité de frais. À partir de 500 FCFA, la vendeuse
 * retire le montant qu’elle demande.
 *
 * En dessous de 19 900 FCFA, on envoie exactement ce montant.
 * À partir de 19 900 FCFA, l’argent arrive sur son mobile money, puis elle
 * retire des espèces : l’opérateur (Mixx ou Moov) prend des frais. Kabakaba
 * les ajoute au montant envoyé, pour qu’elle n’ait pas à les payer.
 * Débit = montant demandé. Envoi = demandé + frais espèces du réseau.
 */

export type MobileOperator = 'FLOOZ' | 'MIXX';
export type WithdrawalTier = 'NO_FEE' | 'NETWORK_HELP';

export const MIN_WITHDRAWAL_FCFA = 500;
/** À partir de ce montant, Kabakaba ajoute les frais de retrait espèces du réseau. */
export const NETWORK_CASH_FROM = 19_900;

/**
 * Retrait cash Flooz (Moov Africa Togo).
 * Jusqu’à 100 000 F : tarif fixe publié.
 * Au-delà : la grille officielle donne une fourchette ; le frais suit le montant
 * entre les deux bornes (moov-africa.tg/moov-money/retrait-flooz).
 */
const FLOOZ_CASH_BRACKETS: Array<{ max: number; fee: number }> = [
  { max: 500, fee: 50 },
  { max: 1_000, fee: 75 },
  { max: 5_000, fee: 100 },
  { max: 15_000, fee: 280 },
  { max: 20_000, fee: 320 },
  { max: 50_000, fee: 600 },
  { max: 100_000, fee: 1_000 },
];

const FLOOZ_CASH_RANGES: Array<{
  min: number;
  max: number;
  feeMin: number;
  feeMax: number;
}> = [
  { min: 100_001, max: 200_000, feeMin: 3_169, feeMax: 3_356 },
  { min: 200_001, max: 300_000, feeMin: 3_729, feeMax: 4_195 },
  { min: 300_001, max: 500_000, feeMin: 4_195, feeMax: 4_381 },
  { min: 500_001, max: 850_000, feeMin: 4_381, feeMax: 4_568 },
  { min: 850_001, max: 1_000_000, feeMin: 4_568, feeMax: 5_407 },
  { min: 1_000_001, max: 1_500_000, feeMin: 5_407, feeMax: 8_110 },
  { min: 1_500_001, max: 2_000_000, feeMin: 8_110, feeMax: 9_788 },
];

/**
 * Retrait cash Mixx by Yas, TTC, en vigueur depuis le 31 janvier 2025
 * (grille yas.tg/MixxTG_Tarif2025.pdf).
 */
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
  { max: 900_000, fee: 4_600 },
  { max: 950_000, fee: 4_900 },
  { max: 1_000_000, fee: 5_100 },
  { max: 1_100_000, fee: 5_400 },
  { max: 1_150_000, fee: 5_900 },
  { max: 1_200_000, fee: 6_200 },
  { max: 1_250_000, fee: 6_500 },
  { max: 1_300_000, fee: 6_800 },
  { max: 1_350_000, fee: 7_000 },
  { max: 1_400_000, fee: 7_300 },
  { max: 1_450_000, fee: 7_600 },
  { max: 1_500_000, fee: 7_800 },
  { max: 2_000_000, fee: 9_700 },
  { max: Infinity, fee: 9_700 },
];

function feeFromBrackets(amount: number, brackets: Array<{ max: number; fee: number }>): number {
  const a = Math.max(0, Number(amount) || 0);
  for (const b of brackets) {
    if (a <= b.max) return b.fee;
  }
  return brackets[brackets.length - 1].fee;
}

function feeInRange(
  amount: number,
  band: { min: number; max: number; feeMin: number; feeMax: number },
): number {
  if (amount <= band.min) return band.feeMin;
  if (amount >= band.max) return band.feeMax;
  const span = band.max - band.min;
  return band.feeMin + Math.round(((amount - band.min) * (band.feeMax - band.feeMin)) / span);
}

function floozCashFee(amount: number): number {
  if (amount <= 100_000) return feeFromBrackets(amount, FLOOZ_CASH_BRACKETS);
  const band = FLOOZ_CASH_RANGES.find((b) => amount <= b.max);
  if (!band) return FLOOZ_CASH_RANGES[FLOOZ_CASH_RANGES.length - 1].feeMax;
  return feeInRange(amount, band);
}

function operatorName(operator: MobileOperator): string {
  return operator === 'FLOOZ' ? 'Moov' : 'Yas';
}

export function cashOutFee(amountFcfa: number, operator: MobileOperator): number {
  const amount = Math.max(0, Number(amountFcfa) || 0);
  if (operator === 'FLOOZ') return floozCashFee(amount);
  return feeFromBrackets(amount, MIXX_CASH_BRACKETS);
}

export interface WithdrawalFeeBreakdown {
  tier: WithdrawalTier;
  operator: MobileOperator;
  /** Montant demandé par le vendeur (ce qu’il veut « avoir »). */
  amountRequested: number;
  /** Toujours 0 : aucun frais n’est retenu sur le solde de la vendeuse. */
  fedapayFee: number;
  /** Frais de retrait espèces du réseau, ajoutés par Kabakaba (0 sous 19 900 FCFA). */
  cashOutFee: number;
  /**
   * Montant à envoyer sur le mobile money.
   * - < 19 900 : = amountRequested
   * - ≥ 19 900 : amountRequested + frais de retrait espèces du réseau
   */
  payoutAmountToSend: number;
  /** Débit sur balanceFcfa vendeur : toujours le montant demandé. */
  debitedFromBalance: number;
  /** Toujours 0 : la vendeuse ne paie pas de frais. */
  vendorBorneFedapayFee: number;
  /** Argent ajouté par Kabakaba (frais espèces du réseau, à partir de 19 900). */
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
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL_FCFA) {
    throw new Error(`Le retrait minimum est de ${MIN_WITHDRAWAL_FCFA} FCFA`);
  }

  const network = operatorName(operator);

  if (amount < NETWORK_CASH_FROM) {
    return {
      tier: 'NO_FEE',
      operator,
      amountRequested: amount,
      fedapayFee: 0,
      cashOutFee: 0,
      payoutAmountToSend: amount,
      debitedFromBalance: amount,
      vendorBorneFedapayFee: 0,
      platformCost: 0,
      summaryLines: [
        `Montant demandé : ${amount} FCFA`,
        `Aucun frais`,
        `Débit du solde : ${amount} FCFA`,
        `Envoi sur ${network} : ${amount} FCFA`,
      ],
    };
  }

  const opCash = cashOutFee(amount, operator);
  const payoutAmountToSend = amount + opCash;
  return {
    tier: 'NETWORK_HELP',
    operator,
    amountRequested: amount,
    fedapayFee: 0,
    cashOutFee: opCash,
    payoutAmountToSend,
    debitedFromBalance: amount,
    vendorBorneFedapayFee: 0,
    platformCost: opCash,
    summaryLines: [
      `Montant demandé : ${amount} FCFA`,
      `Kabakaba ajoute ${opCash} FCFA pour les frais de retrait espèces ${network}`,
      `Débit du solde : ${amount} FCFA`,
      `Envoi sur ${network} : ${payoutAmountToSend} FCFA`,
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
