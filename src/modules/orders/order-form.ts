import { BadRequestException } from '@nestjs/common';
import { ConsumptionMode } from '@prisma/client';

/**
 * Vérifications de forme d'une commande, sans accès à la base. Partagées par la
 * création immédiate (OrdersService) et la programmation (ScheduledOrdersService)
 * pour que les deux appliquent exactement les mêmes règles et les mêmes messages.
 */

// Chaque ligne désigne exactement un menu OU un composant, et un même menu ou
// composant n'apparaît qu'une fois (le client regroupe les quantités).
export function assertItemsShape(items: { menuId?: string; componentId?: string }[]) {
  if (items.some((item) => Boolean(item.menuId) === Boolean(item.componentId))) {
    throw new BadRequestException('Chaque ligne doit désigner un menu ou un composant, pas les deux ni aucun');
  }
  const menuLineIds = items.flatMap((item) => (item.menuId ? [item.menuId] : []));
  if (new Set(menuLineIds).size !== menuLineIds.length) {
    throw new BadRequestException('Un menu ne peut apparaître que dans une seule ligne : regroupez les quantités');
  }
  const componentLineIds = items.flatMap((item) => (item.componentId ? [item.componentId] : []));
  if (new Set(componentLineIds).size !== componentLineIds.length) {
    throw new BadRequestException('Un composant ne peut apparaître que dans une seule ligne : regroupez les quantités');
  }
}

// Sur place : aucune option d'emporté admise. À emporter : une option est requise.
// (L'existence et l'état de l'option sont vérifiés plus tard, avec la base.)
export function assertConsumptionShape(consumptionMode: ConsumptionMode, takeawayOptionId?: string | null) {
  if (consumptionMode === ConsumptionMode.ON_SITE) {
    if (takeawayOptionId !== undefined && takeawayOptionId !== null) {
      throw new BadRequestException("Une option d'emporté ne peut pas être choisie pour une commande sur place");
    }
  } else if (!takeawayOptionId) {
    throw new BadRequestException("Une option d'emporté est requise pour une commande à emporter");
  }
}
