// Prix et disponibilité d'un menu pré-composé, calculés à partir de ses composants
// (cahier V1.3, sections 15 et 16). Source unique, partagée par la consultation
// des menus (MenusService) et la création de commande (OrdersService).

export interface MenuLineComponent {
  id: string;
  name: string;
  priceTickets: number;
  quantity: number;
  isAvailable: boolean;
  deletedAt: Date | null;
}

export interface MenuLineWithComponent {
  quantity: number;
  component: MenuLineComponent;
}

// Prix unitaire du menu : somme de (quantité de la ligne × prix du composant).
export function menuPriceTickets(lines: readonly MenuLineWithComponent[]): number {
  return lines.reduce((total, line) => total + line.quantity * line.component.priceTickets, 0);
}

// Composants qui empêchent le menu d'être servi : supprimé, indisponible,
// ou en stock inférieur à la quantité de la ligne.
export function menuUnavailableComponents(lines: readonly MenuLineWithComponent[]): { id: string; name: string }[] {
  return lines
    .filter(({ quantity, component }) => component.deletedAt !== null || !component.isAvailable || component.quantity < quantity)
    .map(({ component }) => ({ id: component.id, name: component.name }));
}
