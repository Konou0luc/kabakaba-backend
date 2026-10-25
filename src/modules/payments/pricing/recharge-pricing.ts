import { BadRequestException } from '@nestjs/common';

/**
 * Grille tarifaire des recharges Kabakaba.
 *
 * Les paliers sont définis sur le **nombre de tickets** reçus (1 ticket = 1 FCFA).
 * Montant à payer = tickets + frais du palier.
 *
 *   Tickets          Frais    Montant payé
 *   500 – 999        100 F    600 – 1 099 F
 *   1 000 – 2 999    200 F    1 200 – 3 199 F
 *   3 000 – 4 999    250 F    3 250 – 5 249 F
 *   5 000 – 9 999    300 F    5 300 – 10 299 F
 *   10 000           500 F    10 500 F
 *
 * Minimum 500 tickets, maximum 10 000 tickets par recharge.
 *
 * UX recommandée : l’étudiant choisit les **tickets souhaités**.
 * Sens inverse (legacy) : montant payé → tickets = montant − frais. Seuls les
 * montants qui correspondent exactement à un palier sont acceptés (les montants
 * situés entre deux paliers, par ex. 1 100 F, n’existent pas).
 *
 * ⚠️ SÉCURITÉ : tickets et frais sont toujours dérivés côté serveur.
 */

export interface RechargeFeeTier {
  /** Tickets minimum du palier (inclus). */
  minTickets: number;
  /** Tickets maximum du palier (inclus). */
  maxTickets: number;
  /** Frais de service en FCFA pour tout le palier. */
  feeFcfa: number;
}

/** Source unique du barème. Les paliers sont triés par tickets croissants. */
export const RECHARGE_FEE_TIERS: readonly RechargeFeeTier[] = [
  { minTickets: 500, maxTickets: 999, feeFcfa: 100 },
  { minTickets: 1_000, maxTickets: 2_999, feeFcfa: 200 },
  { minTickets: 3_000, maxTickets: 4_999, feeFcfa: 250 },
  { minTickets: 5_000, maxTickets: 9_999, feeFcfa: 300 },
  { minTickets: 10_000, maxTickets: 10_000, feeFcfa: 500 },
];

const FIRST_TIER = RECHARGE_FEE_TIERS[0];
const LAST_TIER = RECHARGE_FEE_TIERS[RECHARGE_FEE_TIERS.length - 1];

/** Tickets min/max par recharge (500 → 10 000). */
export const MIN_RECHARGE_TICKETS = FIRST_TIER.minTickets;
export const MAX_RECHARGE_TICKETS = LAST_TIER.maxTickets;

/** Montants min/max payés (600 F → 10 500 F). */
export const MIN_RECHARGE_AMOUNT_FCFA = FIRST_TIER.minTickets + FIRST_TIER.feeFcfa;
export const MAX_RECHARGE_AMOUNT_FCFA = LAST_TIER.maxTickets + LAST_TIER.feeFcfa;

/** Plages de montants valides, ex. « 600–1099, 1200–3199, … 10500 ». */
function validAmountRangesLabel(): string {
  return RECHARGE_FEE_TIERS.map((t) => {
    const lo = t.minTickets + t.feeFcfa;
    const hi = t.maxTickets + t.feeFcfa;
    return lo === hi ? `${lo}` : `${lo}–${hi}`;
  }).join(', ');
}

function tierForTickets(tickets: number): RechargeFeeTier {
  const tier = RECHARGE_FEE_TIERS.find(
    (t) => tickets >= t.minTickets && tickets <= t.maxTickets,
  );
  if (!tier) {
    throw new BadRequestException('Nombre de tickets hors barème');
  }
  return tier;
}

/**
 * Tickets désirés → montant à payer (tickets + frais du palier).
 * Ex. 500 → 600 ; 1 000 → 1 200 ; 3 000 → 3 250 ; 5 000 → 5 300 ; 10 000 → 10 500.
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
  return tickets + tierForTickets(tickets).feeFcfa;
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
 * Le montant doit correspondre exactement à un palier du barème.
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

  const tier = RECHARGE_FEE_TIERS.find((t) => {
    const tickets = amount - t.feeFcfa;
    return tickets >= t.minTickets && tickets <= t.maxTickets;
  });
  if (!tier) {
    throw new BadRequestException(
      `Montant hors barème. Montants valides (FCFA) : ${validAmountRangesLabel()}. ` +
        'Indique plutôt le nombre de tickets souhaités.',
    );
  }

  const feeFcfa = tier.feeFcfa;
  const ticketsReceived = amount - feeFcfa;

  return {
    amountFcfa: amount,
    ticketsReceived,
    feeFcfa,
    exact: true,
    summaryLines: buildSummary(ticketsReceived, feeFcfa, amount),
  };
}
