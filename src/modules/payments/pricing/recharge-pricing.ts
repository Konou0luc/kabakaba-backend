import { BadRequestException } from '@nestjs/common';

/**
 * Grille tarifaire des recharges Kabakaba.
 *
 * L’étudiant saisit un montant en FCFA (ce qu’il paiera chez FedaPay).
 * Les frais de palier sont **inclus** dans ce montant — on ne redemande
 * pas de frais en plus. Les tickets crédités = montant − frais du palier.
 *
 * Exemple : 2 200 FCFA → palier 1 000–2 999 (frais 200) → 2 000 tickets.
 *
 * ⚠️ SÉCURITÉ : tickets et montant sont toujours dérivés côté serveur.
 */

export const MIN_RECHARGE_TICKETS = 500;
export const MAX_RECHARGE_TICKETS = 10_000;

/** Montant min/max que l’étudiant peut saisir (tickets + frais). */
export const MIN_RECHARGE_AMOUNT_FCFA = MIN_RECHARGE_TICKETS + 100; // 600
export const MAX_RECHARGE_AMOUNT_FCFA = MAX_RECHARGE_TICKETS + 500; // 10 500

const FEE_BRACKETS: Array<{ minTickets: number; maxTickets: number; fee: number }> = [
  { minTickets: 500, maxTickets: 999, fee: 100 },
  { minTickets: 1_000, maxTickets: 2_999, fee: 200 },
  { minTickets: 3_000, maxTickets: 4_999, fee: 250 },
  { minTickets: 5_000, maxTickets: 9_999, fee: 300 },
  { minTickets: 10_000, maxTickets: 10_000, fee: 500 },
];

export function feeForTickets(tickets: number): number {
  for (const b of FEE_BRACKETS) {
    if (tickets >= b.minTickets && tickets <= b.maxTickets) return b.fee;
  }
  throw new BadRequestException('Nombre de tickets hors barème');
}

/**
 * Ancien sens : tickets → montant à payer (toujours utile en interne).
 */
export function computeRechargeAmountFcfa(tickets: number): number {
  if (!Number.isInteger(tickets)) {
    throw new BadRequestException('Le nombre de tickets doit être un entier');
  }
  if (tickets < MIN_RECHARGE_TICKETS) {
    throw new BadRequestException(
      `Le montant minimum de recharge est de ${MIN_RECHARGE_TICKETS} tickets`,
    );
  }
  if (tickets > MAX_RECHARGE_TICKETS) {
    throw new BadRequestException(
      `Le montant maximum de recharge en une fois est de ${MAX_RECHARGE_TICKETS} tickets`,
    );
  }
  return tickets + feeForTickets(tickets);
}

export interface RechargeQuote {
  /** Montant que l’étudiant paie (saisi ou exact du barème). */
  amountFcfa: number;
  /** Tickets qui seront crédités après paiement SUCCESS. */
  ticketsReceived: number;
  /** Frais de palier inclus dans amountFcfa. */
  feeFcfa: number;
  /** true si amountFcfa correspond exactement à tickets + fee. */
  exact: boolean;
  summaryLines: string[];
}

/**
 * Sens mobile : montant FCFA saisi → tickets reçus.
 *
 * 1) Cherche une correspondance exacte (montant = tickets + frais du palier).
 * 2) Sinon, prend le **maximum de tickets** tel que tickets + frais ≤ montant
 *    (l’étudiant paie le montant saisi chez FedaPay ; le surplus de quelques
 *    FCFA hors barème exact reste un surplus plateforme).
 */
export function quoteRechargeFromAmountFcfa(amountFcfa: number): RechargeQuote {
  const amount = Math.floor(Number(amountFcfa));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BadRequestException('Montant de recharge invalide');
  }
  if (amount < MIN_RECHARGE_AMOUNT_FCFA) {
    throw new BadRequestException(
      `Montant minimum : ${MIN_RECHARGE_AMOUNT_FCFA} FCFA (soit ${MIN_RECHARGE_TICKETS} tickets)`,
    );
  }
  if (amount > MAX_RECHARGE_AMOUNT_FCFA) {
    throw new BadRequestException(
      `Montant maximum : ${MAX_RECHARGE_AMOUNT_FCFA} FCFA (soit ${MAX_RECHARGE_TICKETS} tickets)`,
    );
  }

  // 1) Correspondance exacte
  for (const b of FEE_BRACKETS) {
    const tickets = amount - b.fee;
    if (tickets >= b.minTickets && tickets <= b.maxTickets) {
      return {
        amountFcfa: amount,
        ticketsReceived: tickets,
        feeFcfa: b.fee,
        exact: true,
        summaryLines: [
          `Vous payez : ${amount} FCFA`,
          `Frais de service (inclus) : ${b.fee} FCFA`,
          `Tickets crédités : ${tickets}`,
        ],
      };
    }
  }

  // 2) Meilleur effort : max tickets abordables
  let bestTickets = 0;
  let bestFee = 0;
  for (let t = MIN_RECHARGE_TICKETS; t <= MAX_RECHARGE_TICKETS; t++) {
    const fee = feeForTickets(t);
    if (t + fee <= amount && t > bestTickets) {
      bestTickets = t;
      bestFee = fee;
    }
  }
  if (bestTickets < MIN_RECHARGE_TICKETS) {
    throw new BadRequestException(
      `Montant trop faible pour une recharge. Minimum ${MIN_RECHARGE_AMOUNT_FCFA} FCFA.`,
    );
  }

  return {
    amountFcfa: amount,
    ticketsReceived: bestTickets,
    feeFcfa: bestFee,
    exact: false,
    summaryLines: [
      `Vous payez : ${amount} FCFA`,
      `Frais de service (inclus) : ${bestFee} FCFA`,
      `Tickets crédités : ${bestTickets}`,
      `(Montant hors case exacte du barème — tickets = maximum possible)`,
    ],
  };
}
