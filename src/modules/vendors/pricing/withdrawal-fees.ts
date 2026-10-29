/**
 * Frais de retrait vendeur — barèmes réels (Togo).
 *
 * Barèmes historiques conservés pour le calcul des frais produit.
 * Les retraits sont désormais exécutés manuellement par un administrateur :
 * aucun payout FedaPay n’est créé. Le barème FedaPay sous 10 000 FCFA reste
 * appliqué au vendeur, mais la somme est conservée dans la caisse Kabakaba.
 * Les barèmes cash Flooz/Mixx restent utilisés pour déterminer le montant
 * à envoyer lorsque le palier produit l’exige.
 *
 * Paliers produit Kabakaba (qui paie quoi) :
 * - < 10 000  : vendeur paie les frais FedaPay (débités de son solde)
 * - 10 000 – 19 899 : plateforme paie FedaPay ; vendeur reçoit exactement le montant demandé
 * - ≥ 19 900  : on ajoute au montant envoyé les frais de retrait cash du réseau choisi
 *               (Yas ou Moov), selon le barème de ce réseau pour la somme demandée.
 *               Débit vendeur = montant demandé. Envoi = demandé + frais réseau.
 */

export type MobileOperator = 'FLOOZ' | 'MIXX';
export type WithdrawalTier = 'UNDER_10K' | 'FROM_10K_TO_30K' | 'FROM_30K';

const KABAKABA_TIER_LOW = 10_000;
/** À partir de ce montant, les frais de retrait du réseau sont ajoutés à l’envoi. */
const NETWORK_CASH_FROM = 19_900;

/** Barème de frais conservé pour les retraits < 10 000 FCFA. */
const FEDAPAY_PAYOUT_BRACKETS: Array<{ max: number; fee: number }> = [
  { max: 10_000, fee: 150 },
  { max: 50_000, fee: 300 },
  { max: 150_000, fee: 800 },
  { max: 500_000, fee: 2_000 },
  { max: Infinity, fee: 2_500 },
];

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

function fedapayPayoutFee(amountFcfa: number): number {
  return feeFromBrackets(amountFcfa, FEDAPAY_PAYOUT_BRACKETS);
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
  /** Frais historiques appliqués au palier < 10k. En manuel, ils restent dans la caisse Kabakaba. */
  fedapayFee: number;
  /** Frais retrait cash du réseau (0 sous 19 900 FCFA). */
  cashOutFee: number;
  /**
   * Montant à envoyer sur le réseau (arrivé sur Moov/Yas).
   * - < 19 900 : = amountRequested
   * - ≥ 19 900 : amountRequested + frais de retrait du réseau
   */
  payoutAmountToSend: number;
  /** Débit sur balanceFcfa vendeur. */
  debitedFromBalance: number;
  /** Frais retenus dans la caisse Kabakaba sur ce retrait (palier < 10k). */
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
    // Mode manuel : le vendeur supporte toujours le barème <10k.
    // Aucun FedaPay n’est appelé : la différence reste dans la caisse Kabakaba.
    // L’administrateur envoie manuellement le montant demandé.
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
        `Vous recevrez sur ${operatorName(operator)} : ${amount} FCFA`,
      ],
    };
  }

  if (amount < NETWORK_CASH_FROM) {
    // 10 000 – 19 899 : aucun frais réseau n’est ajouté ; envoi du montant demandé.
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
        `Vous recevrez sur ${operatorName(operator)} : ${amount} FCFA`,
      ],
    };
  }

  // ≥ 19 900 : on ajoute les frais de retrait du réseau choisi au montant envoyé.
  const network = operatorName(operator);
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
      `Frais de retrait ${network} : ${opCash} FCFA`,
      `Débit de votre solde : ${amount} FCFA`,
      `Montant envoyé sur ${network} : ${payoutAmountToSend} FCFA`,
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
