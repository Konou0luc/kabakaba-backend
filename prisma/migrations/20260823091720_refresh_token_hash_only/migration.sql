-- Correctif sécurité : RefreshToken.token était stocké en clair (et
-- interrogé pour l'authentification), alors que hashedToken (bcrypt),
-- lui, était calculé mais jamais utilisé. Une fuite de cette table
-- rendait donc tous les refresh tokens actifs directement exploitables.
--
-- On révoque les tokens existants plutôt que de les migrer : les hacher
-- en SQL nécessiterait l'extension pgcrypto (bcrypt via crypt()/gen_salt),
-- une dépendance supplémentaire pour un gain nul ici. Conséquence : tous
-- les utilisateurs devront se reconnecter une fois (leur access token de
-- 15 min reste valide jusqu'à expiration entre-temps, aucune coupure
-- brutale).
DELETE FROM "RefreshToken";

-- hashedToken devient la seule donnée persistée pour un refresh token,
-- et devient obligatoire.
ALTER TABLE "RefreshToken" ALTER COLUMN "hashedToken" SET NOT NULL;

-- Suppression de la colonne en clair et de son index unique.
ALTER TABLE "RefreshToken" DROP COLUMN "token";
