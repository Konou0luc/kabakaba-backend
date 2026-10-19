# Kabakaba — Backend

API REST de Kabakaba (NestJS + Prisma + PostgreSQL), consommée par le dashboard web
(`kabakaba-frontend`) et par l'application mobile. Toutes les routes sont préfixées par `/api/v1`.

## Démarrage local

Prérequis : Node.js, une base PostgreSQL.

```bash
npm install            # lance aussi `prisma generate` (postinstall)
npx prisma migrate deploy
npm run start:dev      # http://localhost:3000/api/v1
```

## Commandes

| Commande | Rôle |
|---|---|
| `npm run build` | `prisma generate` puis compilation Nest (`dist/`) |
| `npm run start:dev` | Démarrage en mode watch |
| `npm run start:prod` | Exécute `dist/src/main` |
| `npm run lint` | ESLint (avec `--fix`) |
| `npm run format` | Prettier sur `src/` |

## Variables d'environnement

Fichier `.env` en local, variables du projet sur Vercel en production. Liste relevée dans le code ;
consulter `src/` pour les valeurs par défaut et le caractère obligatoire de chacune.

| Domaine | Variables |
|---|---|
| Base de données | `DATABASE_URL_PROD` |
| Authentification | `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES` (défaut `1h`), `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES` (défaut `30d`), `JWT_VENDOR_ACCESS_EXPIRES` (défaut `12h`), `JWT_VENDOR_REFRESH_EXPIRES` (défaut `90d`), `JWT_WEB_ACCESS_SECRET`, `TOTP_ENCRYPTION_KEY`, `WEB_AUTH_COOKIE_SECURE`, `WEB_AUTH_COOKIE_SAMESITE` |
| CORS et URL | `CORS_ALLOWED_ORIGINS`, `APP_URL` |
| Crons internes | `CRON_SECRET` |
| Commandes non récupérées | `UNCLAIMED_ORDER_DELAY_MINUTES` (facultative : entier positif, en minutes, défaut 60 ; toute autre valeur retombe sur 60) |
| Exécution | `PORT` (facultative, défaut 3000), `NEST_SERVERLESS` (facultative, `true` pour le mode serverless hors Vercel) ; `NODE_ENV`, `VERCEL` et `VERCEL_ENV` sont lues mais fournies par la plateforme |
| Documentation Swagger | `SWAGGER_USER`, `SWAGGER_PASSWORD` |
| Paiements (FedaPay) | `FEDAPAY_SECRET_KEY`, `FEDAPAY_WEBHOOK_SECRET`, `FEDAPAY_BASE_URL` |
| SMS (AfriqSMS) | `AFRIQSMS_API_KEY`, `AFRIQSMS_CLIENT_ID`, `AFRIQSMS_SENDER_ID`, `AFRIQSMS_BASE_URL` |
| Notifications push (Firebase) | `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON du compte de service Firebase, projet `kabakaba-43a55`) ou `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`. Les tokens FCM sont stockés en table `Device.deviceToken` via `POST /api/v1/devices`. Diagnostic : `GET /api/v1/health` (`push.fcmReady`, `push.devicesActive`) et `POST /api/v1/notifications/test-push` (compte connecté). |

## Documentation de l'API

Swagger est servi sur `/docs` (JSON sur `/docs-json`). En production, l'accès exige une
authentification Basic (`SWAGGER_USER` / `SWAGGER_PASSWORD`) et il est refusé si ces variables
sont absentes.

## Base de données

Schéma dans `prisma/schema.prisma`, migrations dans `prisma/migrations/`. Les migrations s'appliquent avec
`npx prisma migrate deploy` (jamais `migrate dev` ni `migrate reset` sur une base qui porte l'index
partiel des signalements).

**Migration initiale unique** : `prisma/migrations/` contient une seule migration (`*_init`) qui crée tout le
schéma. Elle s'applique sur une base **sans aucune table** (voir `docs/MIGRATION.md`, partie 2) ; ne jamais
l'appliquer sur une base qui porte encore l'ancien historique de migrations.

## Déploiement (Vercel)

`vercel.json` redirige toutes les requêtes vers `api/index.js`, qui charge l'application compilée
dans `dist/`. Les tâches planifiées sont des workflows GitHub Actions (`.github/workflows/`) qui
appellent les routes `internal/cron/*` et `GET /api/v1/health`. Les routes de cron sont authentifiées par
l'en-tête `x-cron-secret` : la valeur doit être la même dans la variable d'environnement Vercel `CRON_SECRET`
et dans le **secret GitHub Actions** du même nom (`Settings > Secrets and variables > Actions`).

| Workflow | Fréquence |
|---|---|
| Keep-alive Neon | toutes les 4 minutes |
| Heartbeat infra | toutes les 5 minutes |
| Commandes programmées (`scheduled-orders`) | toutes les 5 minutes |
| Commandes non récupérées (`unclaimed-orders`) | toutes les 15 minutes |
| Rappels de programmation (`scheduling-reminders`) | une fois par jour, à 07:00 UTC |

La planification GitHub Actions peut être retardée de quelques minutes : une commande programmée peut
donc être passée un peu après son heure prévue.

## Documentation du dépôt

| Document | Contenu |
|---|---|
| `docs/MIGRATION.md` | Régénération de la migration initiale unique et application sur une base vide (Neon) |
| `docs/API_MOBILE.md` | Contrat d'API pour l'équipe mobile : routes ajoutées, modifiées, supprimées, notifications |
| `docs/ESSAIS_BASE_REELLE.md` | Essais à faire sur une vraie base avant l'ouverture aux utilisateurs |
