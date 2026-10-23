import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Noms de catégories réservés. Les PWA vendeur et étudiant utilisent les mêmes libellés. */
export const PLATE_CATEGORY = {
  base: 'Plat de base',
  extra: 'En plus',
  choice: 'Au choix',
  always: 'Toujours mis',
} as const;

/**
 * Un menu fixé peut être commandé seul.
 * Dès que la commande contient des articles libres et que la cantine a publié
 * un plat de base, ce plat est obligatoire — comme au comptoir, sans le riz
 * on ne prend pas seulement le poisson.
 * Si la cantine n'a pas encore de catégorie « Plat de base », l'ancienne
 * carte reste acceptée.
 */
export async function assertComposedPlateHasBase(
  tx: Prisma.TransactionClient,
  vendorId: string,
  componentIds: string[],
) {
  const ids = [...new Set(componentIds.filter(Boolean))];
  if (!ids.length) return;

  const baseCategory = await tx.componentCategory.findFirst({
    where: { vendorId, deletedAt: null, name: PLATE_CATEGORY.base },
    select: { id: true },
  });
  if (!baseCategory) return;

  const published = await tx.component.count({
    where: { vendorId, deletedAt: null, categoryId: baseCategory.id },
  });
  if (!published) return;

  const ordered = await tx.component.count({
    where: { id: { in: ids }, deletedAt: null, categoryId: baseCategory.id },
  });
  if (!ordered) {
    throw new BadRequestException(
      'Choisis d’abord une nourriture de base (par exemple le riz). Sans elle, la commande n’est pas possible.',
    );
  }
}

/**
 * Un accompagnement (soldAlone=false) ne peut pas être le seul article à la
 * carte. Un menu, ou un second composant distinct, en fait un plat.
 */
export async function assertFreeComponentsNotSoldAlone(
  tx: Prisma.TransactionClient,
  items: { menuId?: string; componentId?: string }[],
) {
  if (items.some((item) => item.menuId)) return;

  const ids = [...new Set(items.flatMap((item) => (item.componentId ? [item.componentId] : [])))];
  if (ids.length !== 1) return;

  const component = await tx.component.findFirst({
    where: { id: ids[0], deletedAt: null },
    select: { name: true, soldAlone: true },
  });
  if (!component || component.soldAlone) return;

  throw new BadRequestException(
    `${component.name} ne se vend pas tout seul. Ajoute-le à un plat.`,
  );
}
