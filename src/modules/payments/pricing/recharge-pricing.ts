import { BadRequestException } from '@nestjs/common';

/**
 * Grille tarifaire des recharges Kabakaba.
 *
 * UX recommandée : l’étudiant choisit les **tickets souhaités**.
 * Le montant à payer = tickets + frais du palier.
 *
 * Sens inverse (legacy) : montant payé → tickets = montant − frais.
 *
 * ⚠️ SÉCURITÉ : tickets et frais sont toujours dérivés côté serveur.
 */

export const MIN_RECHARGE_AMOUNT_FCFA = 500;
export const MAX_RECHARGE_AMOUNT_FCFA = 10_000;

/** Tickets min/max (500 FCFA − 100 = 400 ; 10 000 − 500 = 9 500). */
export const MIN_RECHARGE_TICKETS = 400;
export const MAX_RECHARGE_TICKETS = 9_500;

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
 * Tickets désirés → montant à payer (tickets + frais du palier).
 * Les paliers suivent le montant payé (tickets + fee).
 */
export function computeRechargeAmountFcfa(tickets: number): number {
  if (!Number.isInteger(tickets)) {
    throw new BadRequestException('Le nombre de tickets doit être un entier');
  }
  if (tickets < MIN_RECHARGE_TICKETS) {
    throw new BadRequestException(
      `Minimum : ${MIN_RECHARGE_TICKETS} tickets (soit ${MIN_RECHARGE_AMOUNT_FCFA} FCFA payés)`,
    );
  }
  if (tickets > MAX_RECHARGE_TICKETS) {
    throw new BadRequestException(
      `Maximum : ${MAX_RECHARGE_TICKETS} tickets en une fois`,
    );
  }
  for (const b of FEE_BY_AMOUNT) {
    const amount = tickets + b.fee;
    if (amount >= b.min && amount <= b.max) return amount;
  }
  throw new BadRequestException('Nombre de tickets hors barème');
}

export interface RechargeQuote {
  /** Montant que l’étudiant paie (Mobile Money). */
  amountFcfa: number;
  /** Tickets crédités après paiement SUCCESS. */
  ticketsReceived: number;
  /** Frais inclus dans amountFcfa. */
  feeFcfa: number;
  exact: boolean;
  summaryLines: string[];
}

function buildSummary(
  ticketsReceived: number,
  feeFcfa: number,
  amountFcfa: number,
): string[] {
  return [
    `Tu veux ${ticketsReceived} tickets`,
    `Frais de service : ${feeFcfa} FCFA`,
    `Tu paies ${amountFcfa} FCFA`,
  ];
}

/**
 * UX principale : tickets souhaités → montant à payer + frais.
 * Ex. 500 tickets → frais 100 → paie 600 FCFA.
 */
export function quoteRechargeFromTickets(ticketsDesired: number): RechargeQuote {
  const tickets = Math.floor(Number(ticketsDesired));
  if (!Number.isFinite(tickets) || tickets <= 0) {
    throw new BadRequestException('Nombre de tickets invalide');
  }
  const amountFcfa = computeRechargeAmountFcfa(tickets);
  const feeFcfa = amountFcfa - tickets;
  return {
    amountFcfa,
    ticketsReceived: tickets,
    feeFcfa,
    exact: true,
    summaryLines: buildSummary(tickets, feeFcfa, amountFcfa),
  };
}

/**
 * Sens legacy / amount-first : montant FCFA saisi → tickets reçus.
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
    summaryLines: buildSummary(ticketsReceived, feeFcfa, amount),
  };
}
