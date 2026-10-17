import { BadRequestException } from '@nestjs/common';

/**
 * Grille tarifaire des recharges Kabakaba.
 *
 * L’étudiant saisit le montant FCFA qu’il paie (500 → 10 000).
 * Les frais sont inclus dans ce montant ; tickets = montant − frais.
 *
 * ⚠️ SÉCURITÉ : tickets et frais sont toujours dérivés côté serveur.
 */

export const MIN_RECHARGE_AMOUNT_FCFA = 500;
export const MAX_RECHARGE_AMOUNT_FCFA = 10_000;

/** Conservés pour le mode legacy tickets → montant. */
export const MIN_RECHARGE_TICKETS = 400; // 500 − 100
export const MAX_RECHARGE_TICKETS = 9_500; // 10 000 − 500

const FEE_BY_AMOUNT: Array<{ min: number; max: number; fee: number }> = [
  { min: 500, max: 999, fee: 100 },
  { min: 1_000, max: 4_999, fee: 200 },
  { min: 5_000, max: 9_999, fee: 300 },
  { min: 10_000, max: 10_000, fee: 500 },
];

function feeForAmount(amount: number): number {
  for (const b of FEE_BY_AMOUNT) {
    if (amount >= b.min && amount <= b.max) return b.fee;
  }
  throw new BadRequestException('Montant hors barème de recharge');
}

/**
 * Ancien sens : tickets désirés → montant à payer (tickets + frais du palier).
 * Les paliers suivent le montant payé (tickets + fee).
 */
export function computeRechargeAmountFcfa(tickets: number): number {
  if (!Number.isInteger(tickets)) {
    throw new BadRequestException('Le nombre de tickets doit être un entier');
  }
  if (tickets < MIN_RECHARGE_TICKETS) {
    throw new BadRequestException(
      `Le montant minimum de recharge est de ${MIN_RECHARGE_AMOUNT_FCFA} FCFA`,
    );
  }
  if (tickets > MAX_RECHARGE_TICKETS) {
    throw new BadRequestException(
      `Le montant maximum de recharge en une fois est de ${MAX_RECHARGE_AMOUNT_FCFA} FCFA`,
    );
  }
  // Cherche le plus petit montant exact tickets + fee dans le barème.
  for (const b of FEE_BY_AMOUNT) {
    const amount = tickets + b.fee;
    if (amount >= b.min && amount <= b.max) return amount;
  }
  throw new BadRequestException('Nombre de tickets hors barème');
}

export interface RechargeQuote {
  /** Montant que l’étudiant paie. */
  amountFcfa: number;
  /** Tickets crédités après paiement SUCCESS. */
  ticketsReceived: number;
  /** Frais inclus dans amountFcfa. */
  feeFcfa: number;
  exact: boolean;
  summaryLines: string[];
}

/**
 * Sens mobile : montant FCFA saisi → tickets reçus.
 */
export function quoteRechargeFromAmountFcfa(amountFcfa: number): RechargeQuote {
  const amount = Math.floor(Number(amountFcfa));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BadRequestException('Montant de recharge invalide');
  }
  if (amount < MIN_RECHARGE_AMOUNT_FCFA) {
    throw new BadRequestException(
      `Montant minimum : ${MIN_RECHARGE_AMOUNT_FCFA} FCFA`,
    );
  }
  if (amount > MAX_RECHARGE_AMOUNT_FCFA) {
    throw new BadRequestException(
      `Montant maximum : ${MAX_RECHARGE_AMOUNT_FCFA} FCFA`,
    );
  }

  const feeFcfa = feeForAmount(amount);
  const ticketsReceived = amount - feeFcfa;
  if (ticketsReceived < 1) {
    throw new BadRequestException('Montant trop faible pour une recharge');
  }

  return {
    amountFcfa: amount,
    ticketsReceived,
    feeFcfa,
    exact: true,
    summaryLines: [
      `Tu paies ${amount} FCFA`,
      `${ticketsReceived} tickets crédités`,
    ],
  };
}
