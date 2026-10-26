import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Noms de catégories réservés. Les PWA vendeur et étudiant utilisent les mêmes libellés. */
export const PLATE_CATEGORY = {
  base: 'Plat de base',
  extra: 'En plus',
  choice: 'Au choix',
  always: 'Toujours mis',
  drink: 'Jus & Boissons',
} as const;

/**
 * Un menu fixé peut être commandé seul.
 * Une boisson aussi : elle se vend seule.
 * Un accompagnement (sauce, poisson) exige une nourriture de base dès que la
 * cantine en a publié une.
 */
export async function assertComposedPlateHasBase(
  tx: Prisma.TransactionClient,
  vendorId: string,
  componentIds: string[],
) {
  const ids = [...new Set(componentIds.filter(Boolean))];
  if (!ids.length) return;

  const ordered = await tx.component.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { categoryId: true, soldAlone: true },
  });
  if (!ordered.some((row) => !row.soldAlone)) return;

  const baseCategory = await tx.componentCategory.findFirst({
    where: { vendorId, deletedAt: null, name: PLATE_CATEGORY.base },
    select: { id: true },
  });
  if (!baseCategory) return;

  const published = await tx.component.count({
    where: { vendorId, deletedAt: null, categoryId: baseCategory.id },
  });
  if (!published) return;

  if (!ordered.some((row) => row.categoryId === baseCategory.id)) {
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
