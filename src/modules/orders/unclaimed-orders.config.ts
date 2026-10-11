// Délai (en minutes) au-delà duquel une commande restée « Prête » est signalée « non
// récupérée » (CDC 30). Paramétrable par la variable d'environnement
// UNCLAIMED_ORDER_DELAY_MINUTES.
export const UNCLAIMED_ORDER_DELAY_ENV = 'UNCLAIMED_ORDER_DELAY_MINUTES';
export const DEFAULT_UNCLAIMED_ORDER_DELAY_MINUTES = 60;

/**
 * Lit la valeur brute de l'environnement : un entier strictement positif, en chiffres
 * uniquement. Renvoie null si la valeur est absente, vide, non numérique (« abc », « 45min »,
 * « 1.5 », « -10 »), nulle, ou si elle ne donne pas une date valide ; l'appelant retombe
 * alors sur DEFAULT_UNCLAIMED_ORDER_DELAY_MINUTES.
 */
export function parseUnclaimedDelayMinutes(raw: string | undefined): number | null {
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value)) return null;
  const minutes = Number(value);
  if (!Number.isSafeInteger(minutes) || minutes <= 0) return null;
  if (Number.isNaN(new Date(Date.now() - minutes * 60_000).getTime())) return null;
  return minutes;
}
