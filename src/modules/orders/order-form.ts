import { BadRequestException } from '@nestjs/common';
import { ConsumptionMode } from '@prisma/client';

/**
 * Vérifications de forme d'une commande, sans accès à la base. Partagées par la
 * création immédiate (OrdersService) et la programmation (ScheduledOrdersService)
 * pour que les deux appliquent exactement les mêmes règles et les mêmes messages.
 */

// Chaque ligne désigne exactement un menu OU un composant.
// Un même article peut revenir dans un autre plat (deux pains composés
// différemment). Dans un même plat, il n'apparaît qu'une fois.
export function assertItemsShape(items: { menuId?: string; componentId?: string; plateKey?: string }[]) {
  if (items.some((item) => Boolean(item.menuId) === Boolean(item.componentId))) {
    throw new BadRequestException('Chaque ligne doit désigner un menu ou un composant, pas les deux ni aucun');
  }
  if (items.some((item) => item.plateKey != null && !/^[A-Za-z0-9_-]{1,40}$/.test(item.plateKey))) {
    throw new BadRequestException('Le regroupement du plat est invalide');
  }
  const keys = items.map((item) => `${item.plateKey || ''}::${item.menuId || item.componentId}`);
  if (new Set(keys).size !== keys.length) {
    throw new BadRequestException('Un article ne peut apparaître qu’une fois dans le même plat : regroupez les quantités');
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
