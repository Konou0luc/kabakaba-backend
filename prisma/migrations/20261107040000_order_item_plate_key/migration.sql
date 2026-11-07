-- Regroupe les lignes d'un même plat (pain + œuf) pour l'affichage.
-- Les commandes déjà passées restent sans clé : l'app les reconstitue
-- à partir de la catégorie du composant.
ALTER TABLE "OrderItem" ADD COLUMN "plateKey" TEXT;
