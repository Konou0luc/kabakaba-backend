import { utcDayKey } from './stats-range';

// Agrégations pures des indicateurs d'administration (CDC 39 et 40), sans accès base :
// le service charge les lignes, ces fonctions calculent.

// Statuts dont le montant est crédité à la vendeuse (READY et RECEIVED) : ils forment le chiffre
// d'affaires et les ventes. 1 ticket = 1 FCFA.
export const CREDITED_STATUSES = ['READY', 'RECEIVED'] as const;

export interface OrderRow {
  createdAt: Date;
  status: string;
  totalTickets: number;
  unclaimedAt: Date | null;
}

export interface OrdersSummary {
  totals: {
    orders: number;
    receivedOrders: number;
    cancelledOrders: number;
    unclaimedOrders: number;
    revenueTickets: number;
    completionRate: number;
  };
  daily: { date: string; orders: number; revenueTickets: number; cancelledOrders: number }[];
}

export function isCredited(status: string): boolean {
  return (CREDITED_STATUSES as readonly string[]).includes(status);
}

/**
 * Taux de complétion : RECEIVED / (RECEIVED + CANCELLED), en pourcentage entier (même convention
 * que le taux de complétion des campus). 0 quand aucune commande n'est tranchée.
 */
export function completionRate(received: number, cancelled: number): number {
  const decided = received + cancelled;
  return decided > 0 ? Math.round((received / decided) * 100) : 0;
}

export function summarizeOrders(rows: OrderRow[], dayKeys: string[]): OrdersSummary {
  const daily = new Map(dayKeys.map((date) => [date, { date, orders: 0, revenueTickets: 0, cancelledOrders: 0 }]));
  let receivedOrders = 0;
  let cancelledOrders = 0;
  let unclaimedOrders = 0;
  let revenueTickets = 0;
  let orders = 0;

  for (const row of rows) {
    const day = daily.get(utcDayKey(row.createdAt));
    if (!day) continue; // hors intervalle : ignorée
    orders += 1;
    day.orders += 1;
    if (row.status === 'RECEIVED') receivedOrders += 1;
    if (row.status === 'CANCELLED') {
      cancelledOrders += 1;
      day.cancelledOrders += 1;
    }
    if (row.unclaimedAt) unclaimedOrders += 1;
    if (isCredited(row.status)) {
      revenueTickets += row.totalTickets;
      day.revenueTickets += row.totalTickets;
    }
  }

  return {
    totals: {
      orders,
      receivedOrders,
      cancelledOrders,
      unclaimedOrders,
      revenueTickets,
      completionRate: completionRate(receivedOrders, cancelledOrders),
    },
    daily: dayKeys.map((date) => daily.get(date)!),
  };
}

/**
 * Commandes créées par heure UTC (0 à 23) et par jour de semaine UTC (0 = dimanche à 6 = samedi).
 * Toutes les valeurs sont présentes, y compris à zéro.
 */
export function summarizePeaks(createdAts: Date[]) {
  const hours = new Array<number>(24).fill(0);
  const weekdays = new Array<number>(7).fill(0);
  for (const createdAt of createdAts) {
    hours[createdAt.getUTCHours()] += 1;
    weekdays[createdAt.getUTCDay()] += 1;
  }
  return {
    peakHours: hours.map((orders, hour) => ({ hour, orders })),
    peakWeekdays: weekdays.map((orders, weekday) => ({ weekday, orders })),
  };
}
