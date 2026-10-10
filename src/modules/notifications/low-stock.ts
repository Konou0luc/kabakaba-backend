// Alerte de stock faible (CDC 41).

export interface LowStockAlert {
  vendorId: string;
  componentId: string;
  name: string;
  // Quantité restante après la déduction ou l'ajustement.
  remaining: number;
}

/**
 * Vrai quand une baisse de stock fait PASSER la quantité de « au moins le seuil » à « sous le
 * seuil ». Faux sans seuil, faux si la quantité était déjà sous le seuil (pas de répétition
 * tant qu'elle y reste), faux si elle reste au moins égale au seuil.
 */
export function hasCrossedLowStockThreshold(
  quantityBefore: number,
  quantityAfter: number,
  threshold: number | null | undefined,
): boolean {
  if (threshold === null || threshold === undefined) return false;
  return quantityBefore >= threshold && quantityAfter < threshold;
}
