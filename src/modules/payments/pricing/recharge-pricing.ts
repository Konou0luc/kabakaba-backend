import { BadRequestException } from '@nestjs/common';

/**
 * Grille tarifaire officielle des recharges (barème communiqué par le
 * porteur produit — voir capture "montant minimum 500 FCFA = 500 tickets,
 * frais fixe par palier").
 *
 * ⚠️ SÉCURITÉ : cette fonction est l'UNIQUE source de vérité pour la
 * conversion tickets -> FCFA. Le montant facturé ne doit JAMAIS être
 * fourni par le client (cf. faille corrigée en août 2026 : un client
 * pouvait envoyer `amount: 100` et `ticketsReceived: 999999`
 * indépendamment l'un de l'autre).
 */

export const MIN_RECHARGE_TICKETS = 500;
export const MAX_RECHARGE_TICKETS = 10000;

/**
 * Renvoie le montant en FCFA que l'étudiant doit payer pour recevoir
 * `tickets` tickets, selon le barème de frais par palier :
 *   500   -   999  tickets -> + 100 FCFA de frais
 *   1000  -  2999  tickets -> + 200 FCFA de frais
 *   3000  -  4999  tickets -> + 250 FCFA de frais
 *   5000  -  9999  tickets -> + 300 FCFA de frais
 *   10000 (max)            -> + 500 FCFA de frais
 *
 * Lève une BadRequestException si `tickets` est hors bornes.
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

  let fee: number;
  if (tickets < 1000) {
    fee = 100; // palier 500-999
  } else if (tickets < 3000) {
    fee = 200; // palier 1000-2999
  } else if (tickets < 5000) {
    fee = 250; // palier 3000-4999
  } else if (tickets < 10000) {
    fee = 300; // palier 5000-9999
  } else {
    fee = 500; // 10000 (montant maximum)
  }

  return tickets + fee;
}
