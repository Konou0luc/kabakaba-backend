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
| Authentification | `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES`, `JWT_WEB_ACCESS_SECRET`, `TOTP_ENCRYPTION_KEY`, `WEB_AUTH_COOKIE_SECURE`, `WEB_AUTH_COOKIE_SAMESITE` |
| CORS et URL | `CORS_ALLOWED_ORIGINS`, `APP_URL` |
| Crons internes | `CRON_SECRET` |
| Documentation Swagger | `SWAGGER_USER`, `SWAGGER_PASSWORD` |
| Paiements (FedaPay) | `FEDAPAY_SECRET_KEY`, `FEDAPAY_WEBHOOK_SECRET`, `FEDAPAY_BASE_URL` |
| SMS (AfriqSMS) | `AFRIQSMS_API_KEY`, `AFRIQSMS_CLIENT_ID`, `AFRIQSMS_SENDER_ID`, `AFRIQSMS_BASE_URL` |
| Notifications push (Firebase) | `FIREBASE_SERVICE_ACCOUNT_JSON` ou `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |

## Documentation de l'API

Swagger est servi sur `/docs` (JSON sur `/docs-json`). En production, l'accès exige une
authentification Basic (`SWAGGER_USER` / `SWAGGER_PASSWORD`) et il est refusé si ces variables
sont absentes.

## Base de données

Schéma dans `prisma/schema.prisma`, migrations dans `prisma/migrations/`.
Appliquer les migrations avec `npx prisma migrate deploy`.

## Déploiement (Vercel)

`vercel.json` redirige toutes les requêtes vers `api/index.js`, qui charge l'application compilée
dans `dist/`. Les tâches planifiées sont des workflows GitHub Actions (`.github/workflows/`) qui
appellent les routes `internal/cron/*` (authentifiées par `CRON_SECRET`) et `GET /api/v1/health` :

| Workflow | Fréquence |
|---|---|
| Keep-alive Neon | toutes les 4 minutes |
| Heartbeat infra | toutes les 5 minutes |
| Commandes programmées (`scheduled-orders`) | toutes les 5 minutes |

La planification GitHub Actions peut être retardée de quelques minutes : une commande programmée peut
donc être passée un peu après son heure prévue.
