-- Suppression des tables web jamais utilisées par le code applicatif :
--   WebUserSession, WebUserPreferences, WebUserNotificationSetting.
-- Les contraintes de clé étrangère et les index qui leur sont rattachés
-- disparaissent avec les tables. Aucune autre table ne les référence.
--
-- AVANT D'APPLIQUER EN PRODUCTION : vérifier qu'elles sont bien vides, par ex. :
--   SELECT 'WebUserSession' t, count(*) FROM "WebUserSession"
--   UNION ALL SELECT 'WebUserPreferences', count(*) FROM "WebUserPreferences"
--   UNION ALL SELECT 'WebUserNotificationSetting', count(*) FROM "WebUserNotificationSetting";

-- DropTable
DROP TABLE IF EXISTS "WebUserSession";

-- DropTable
DROP TABLE IF EXISTS "WebUserPreferences";

-- DropTable
DROP TABLE IF EXISTS "WebUserNotificationSetting";
