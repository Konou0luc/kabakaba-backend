-- Suppression d'un champ mort : escrowBalance n'a jamais été lu ni écrit par
-- le code métier. Le séquestre est calculé par agrégat sur les commandes
-- actives (voir transactions.service.ts::getStats), pas par ce compteur par
-- utilisateur. Le laisser en base l'exposait tel quel (toujours 0) dans
-- toute réponse API renvoyant un User complet, ce qui pouvait laisser croire
-- à tort qu'il s'agissait d'une donnée fiable.
ALTER TABLE "User" DROP COLUMN "escrowBalance";
