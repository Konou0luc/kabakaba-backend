import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConsumptionMode, Prisma } from '@prisma/client';

/**
 * Contrôles d'EXISTENCE et d'APPARTENANCE des articles d'une commande (menus, composants
 * libres, option d'emporté), avec leurs messages d'erreur. Source unique, partagée par la
 * création d'une commande (OrdersService) et par la programmation d'une commande
 * (ScheduledOrdersService) : les deux refusent les mêmes erreurs avec les mêmes messages.
 *
 * Ces fonctions ne regardent NI le stock, NI la disponibilité d'un composant ou d'un
 * menu, NI le prix, NI le solde : ces contrôles dépendent du moment et restent propres à
 * la création effective de la commande.
 */

export type OrderMenu = Prisma.MenuGetPayload<{ include: { lines: { include: { component: true } } } }>;
export type OrderComponent = Prisma.ComponentGetPayload<object>;

interface OrderItemRef {
  menuId?: string;
  componentId?: string;
}

// Menus pré-composés (avec leurs composants) et composants libres de la commande,
// chargés en une fois. Les articles supprimés sont absents du résultat.
export async function loadOrderArticles(tx: Prisma.TransactionClient, items: OrderItemRef[]) {
  const menuIds = items.flatMap((i) => (i.menuId ? [i.menuId] : []));
  const componentIds = items.flatMap((i) => (i.componentId ? [i.componentId] : []));
  const menus = menuIds.length
    ? await tx.menu.findMany({
        where: { id: { in: menuIds }, deletedAt: null },
        include: { lines: { include: { component: true } } },
      })
    : [];
  const freeComponents = componentIds.length
    ? await tx.component.findMany({ where: { id: { in: componentIds }, deletedAt: null } })
    : [];
  return {
    menuById: new Map<string, OrderMenu>(menus.map((m) => [m.id, m])),
    componentById: new Map<string, OrderComponent>(freeComponents.map((c) => [c.id, c])),
  };
}

// Le menu existe, appartient à la cantine et est actif.
export function resolveOrderMenu(menuById: Map<string, OrderMenu>, menuId: string, vendorId: string): OrderMenu {
  const menu = menuById.get(menuId);
  if (!menu) throw new NotFoundException(`Menu ${menuId} introuvable`);
  if (menu.vendorId !== vendorId) {
    throw new BadRequestException(`Le menu "${menu.name}" n'appartient pas à ce vendeur`);
  }
  if (!menu.isActive) {
    throw new BadRequestException(`Menu "${menu.name}" indisponible`);
  }
  return menu;
}

// Le composant existe et appartient à la cantine.
export function resolveOrderComponent(
  componentById: Map<string, OrderComponent>,
  componentId: string,
  vendorId: string,
): OrderComponent {
  const component = componentById.get(componentId);
  if (!component) throw new NotFoundException(`Composant ${componentId} introuvable`);
  if (component.vendorId !== vendorId) {
    throw new BadRequestException(`Le composant "${component.name}" n'appartient pas à ce vendeur`);
  }
  return component;
}

// L'option d'emporté appartient à la cantine, est active et non supprimée.
export async function findOrderTakeawayOption(tx: Prisma.TransactionClient, takeawayOptionId: string, vendorId: string) {
  const takeawayOption = await tx.takeawayOption.findFirst({
    where: { id: takeawayOptionId, vendorId, isActive: true, deletedAt: null },
  });
  if (!takeawayOption) {
    throw new NotFoundException("Option d'emporté introuvable ou indisponible pour cette cantine");
  }
  return takeawayOption;
}

// Contrôle complet à la programmation : lignes dans l'ordre de la demande, puis option
// d'emporté, comme la création d'une commande. Rien d'autre n'est vérifié (voir plus haut).
export async function assertOrderArticles(
  tx: Prisma.TransactionClient,
  order: { vendorId: string; items: OrderItemRef[]; consumptionMode: ConsumptionMode; takeawayOptionId?: string | null },
) {
  const { menuById, componentById } = await loadOrderArticles(tx, order.items);
  for (const item of order.items) {
    if (item.menuId) resolveOrderMenu(menuById, item.menuId, order.vendorId);
    else resolveOrderComponent(componentById, item.componentId!, order.vendorId);
  }
  if (order.consumptionMode === ConsumptionMode.TAKEAWAY) {
    await findOrderTakeawayOption(tx, order.takeawayOptionId!, order.vendorId);
  }
}
