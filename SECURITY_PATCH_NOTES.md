# Security patch — SEC-02 à SEC-04

Corrections appliquées :

- **SEC-02 — Tokens d'onboarding et de reset réutilisables**
  - Ajout de `WebAuthChallenge` pour stocker côté serveur les jetons temporaires.
  - Ajout d'un `jti` aléatoire à chaque challenge.
  - Les jetons onboarding sont maintenant séquentiels : étape 1 → 2 → 3, avec rotation du token à chaque étape.
  - Les tokens de reset sont à usage unique.
  - Le challenge 2FA de connexion est également à usage unique.
  - La consommation des challenges est atomique via `updateMany(... consumedAt: null ...)`, ce qui bloque le rejeu concurrent.

- **SEC-03 — Race condition sur les codes 2FA de secours**
  - Consommation atomique des challenges temporaires et conservation de la consommation atomique existante des backup codes.
  - Une seule requête concurrente peut consommer un challenge web temporaire.

- **SEC-04 — Contournement de suspension vendeur**
  - Un vendeur ne peut plus modifier `isActive`, `suspensionReason` ou `campusIds` sur `PATCH /vendors/:id`.
  - Ces champs sont strictement réservés aux administrateurs.
  - Le vendeur conserve uniquement les modifications de profil autorisées.
  - `PATCH /vendors/me` reste limité aux champs vendeur prévus.

## Migration base de données

Une nouvelle migration Prisma est incluse :

`prisma/migrations/20260906195000_secure_web_auth_flow_tokens/migration.sql`

À appliquer avec votre procédure Prisma habituelle avant d'utiliser les nouveaux flux d'authentification.

## Important côté frontend

Après `first-login/password`, le backend renvoie désormais un nouveau `onboardingToken`.

Après `first-login/2fa/setup`, le backend renvoie également un nouveau `onboardingToken`.

Le frontend doit utiliser le token retourné par chaque étape pour appeler l'étape suivante. L'ancien token doit être abandonné.

Aucun test npm n'a été exécuté dans cette livraison, conformément à la demande.

## SEC-05 à SEC-10

- SEC-05 : remplacement du storage mémoire de `@nestjs/throttler` par un storage PostgreSQL partagé entre les instances Vercel. Les limites `@Throttle` existantes restent applicables.
- SEC-06 : aucune modification dans ce patch (déjà traité/suivi séparément).
- SEC-07 : aucune modification dans ce patch (déjà traité/suivi séparément).
- SEC-08 : aucune modification dans ce patch (déjà traité/suivi séparément).
- SEC-09 : aucune modification dans ce patch (déjà traité/suivi séparément).
- SEC-10 : suppression des données SMS/fournisseur trop détaillées des logs, masquage des numéros de téléphone et suppression du titre de notification dans les logs push.

## SEC-06 → SEC-09 (2026-09-06)

### SEC-06 — erreurs internes
- Les exceptions inattendues ne renvoient plus leur message interne au client.
- Un `requestId` est retourné pour corrélation avec les logs.
- Les détails techniques sont journalisés côté serveur uniquement.

### SEC-07 — révocation après changement de mot de passe mobile
- `POST /auth/change-password` révoque tous les refresh tokens actifs de l'utilisateur dans la même transaction.
- Toute modification de mot de passe via `UsersService.update()` révoque également les refresh tokens actifs.
- Le token d'accès courant peut rester valide jusqu'à sa courte expiration normale ; les refresh tokens sont invalidés immédiatement.

### SEC-08 — changement de campus
- `campusId` n'est plus librement modifiable par un utilisateur dans `SELF_UPDATABLE_FIELDS`.
- Un changement de campus explicitement fourni par un appel privilégié est validé contre un campus existant et non supprimé.
- Un utilisateur qui tente de modifier son propre campus doit être un `STUDENT`; le campus cible doit exister et être actif.

### SEC-09 — secret TOTP
- `WebUser.twoFaSecret` est maintenant chiffré en AES-256-GCM avant stockage.
- Variable d'environnement obligatoire : `TOTP_ENCRYPTION_KEY`.
- Format accepté : 64 caractères hexadécimaux (32 octets) ou une valeur base64 décodant en 32 octets.
- Les anciens secrets en clair sont migrés automatiquement lors de leur prochaine utilisation TOTP.

### Action requise en production pour SEC-09
Générer une clé aléatoire forte et la définir dans Vercel / l'environnement de production :

`openssl rand -hex 32`

Ne jamais committer cette clé dans Git. La même clé doit être conservée pour toute la durée de vie des secrets TOTP existants. Une rotation de clé nécessite une procédure de re-chiffrement dédiée.

## SEC-11 → SEC-15 patch (2026-09-06)
- SEC-11: Vercel catch no longer returns internal exception messages.
- SEC-12: audit actor is derived from authenticated request; client cannot submit adminId. AuditLog.adminId is nullable so webUserId can be used for web admins.
- SEC-13: manual transaction creation restricted to SUPER_ADMIN mobile, positive amount required; transaction PATCH is now immutable/forbidden.
- SEC-14: OTP verification now uses atomic conditional updates for failed attempts and one-time consumption.
- SEC-15: refresh tokens are revoked after password changes, role changes, and suspensions/bans.

### Migration required
Apply Prisma migration:
`20260906195500_make_audit_actor_optional`

Command in deployment environment:
`npx prisma migrate deploy`


## SEC-16 → SEC-19

- SEC-16: Swagger UI assets are served locally from the installed `swagger-ui-dist` package; removed CDN runtime dependency.
- SEC-17: CORS now explicitly allows `X-Request-Id`; production remains fail-closed when `CORS_ALLOWED_ORIGINS` is absent.
- SEC-18: server-generated UUID request IDs are now used for response/log correlation; client-provided IDs no longer overwrite server IDs.
- SEC-19: Swagger assets are local, removing the runtime jsDelivr supply-chain dependency.

### Production action
Set `CORS_ALLOWED_ORIGINS` to the exact frontend origin(s) in production. No new secret is required for SEC-16/18/19.
