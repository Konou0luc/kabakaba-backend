<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Security hardening — Step 2

Implemented order/escrow protections:
- Strict server-side order state machine; backward transitions are rejected.
- Order financial and ownership fields are immutable after creation through PATCH.
- `READY` is claimed atomically with `escrowReleasedAt IS NULL`.
- Escrow release can occur only on the atomic transition into `READY`.
- `readyAt` is recorded at the same time as the READY transition.
- Legacy orders that already have an `ESCROW_RELEASE` transaction are backfilled with `escrowReleasedAt` by the Prisma migration.
- No npm build/test was run by design; the project should be tested locally after installation of dependencies.

## Authentification de l'application vendeur mobile

L'app vendeur ne se connecte ni par `login-email` ni par le flux OTP étudiant :
elle utilise un parcours dédié où un **code PIN à 4 chiffres remplace le mot de
passe** pour les connexions quotidiennes.

**Activation** (première connexion, et seul chemin de récupération d'un PIN oublié) :

| Étape | Route | Corps | Réponse |
|---|---|---|---|
| 1 | `POST /api/v1/auth/vendor/activate/start` | `phone`, `password` | `onboardingToken`, `phoneMasked` + envoi de l'OTP par SMS |
| 2 | `POST /api/v1/auth/vendor/activate/verify-otp` | `onboardingToken`, `code` | `pinSetupToken` |
| 3 | `POST /api/v1/auth/vendor/activate/set-pin` | `pinSetupToken`, `pin` | `user`, `vendor`, `accessToken`, `refreshToken` |

**Connexions suivantes** : `POST /api/v1/auth/vendor/login-pin` avec `phone` + `pin`.

Le `password` est le mot de passe temporaire créé par l'admin via `POST /vendors`
(`mustChangePassword: true`). Il n'est plus saisi au quotidien après l'activation,
mais reste le secret exigé pour reposer un PIN — un accès à la seule carte SIM ne
suffit donc pas à reprendre la main sur une cantine.

Choix de sécurité :
- Les jetons d'étape portent un `scope` et sont signés avec des clés **dérivées
  par HMAC** du `JWT_ACCESS_SECRET` (une clé distincte par étape, aucune variable
  d'environnement supplémentaire). `JwtStrategy` refuse en plus tout jeton porteur
  d'un `scope`, donc un jeton d'étape ne peut jamais servir de token d'accès.
- `User.pinHash` est un bcrypt appliqué au **HMAC poivré** du PIN, pas au PIN brut :
  un PIN à 4 chiffres ne vaut que 10 000 combinaisons, et une fuite de la base
  seule ne permet pas de le retrouver hors ligne sans le secret applicatif.
- 5 échecs consécutifs verrouillent le PIN 15 minutes (`pinFailedAttempts`,
  `pinLockedUntil`), en plus du throttling HTTP (10 req/min sur `login-pin`).
- Les PIN triviaux (`0000`, `1111`, `1234`, `4321`…) sont refusés.
- Poser un PIN révoque tous les refresh tokens du compte, comme un changement de
  mot de passe.

Migration à appliquer : `prisma/migrations/20260927190000_add_vendor_pin_auth`.

## Journal des correctifs de sécurité

Cette section reprend, sans changement de fond, le contenu des anciens fichiers `README_SECURITY_PATCH.md` et `SECURITY_PATCH_NOTES.md`.

### Security patch SEC-20 to SEC-25

Applied on top of the SEC-02 to SEC-19 build-fixed version.

#### Required production actions

No new environment variable is required by SEC-20/21/22/25.

SEC-27 (partner application public endpoint enumeration risk) was explicitly accepted by the project owner and remains unchanged.

### Security patch SEC-40 → SEC-44

#### SEC-40 — Atomic refunds
Refunds initiated by vendors and dispute resolutions now run at SERIALIZABLE transaction isolation to prevent concurrent refunds from racing on the vendor balance. The existing order/dispute claim remains atomic.

#### SEC-41 — Withdrawal completion
The admin status endpoint no longer permits an administrator to force a withdrawal to COMPLETED. Admins can move withdrawals to PROCESSING or FAILED only. COMPLETED must come from a future provider-confirmation flow.

#### SEC-42 — Payout idempotency
Withdrawals now have a unique optional payoutReference plus payoutRequestedAt/payoutCompletedAt. When an admin moves a withdrawal to PROCESSING, the withdrawal id is used as the stable idempotency reference and is recorded once.

#### SEC-43/44 — Provider confirmation hardening
No manual endpoint is added to fake a provider success. COMPLETED remains unavailable to the admin status endpoint until an authenticated provider/webhook confirmation flow is implemented. This avoids creating a false sense of payout verification.

#### SEC-45 — Payout FedaPay réel et idempotent

- Le passage manuel à `PROCESSING` déclenche désormais le payout FedaPay.
- `merchant_reference` = ID interne du retrait pour rendre les retries idempotents.
- Avant toute création, le backend recherche un payout existant par `merchant_reference`.
- `COMPLETED` et `FAILED` ne sont plus pilotables manuellement : ils proviennent du statut FedaPay.
- `POST /withdrawals/:id/sync` resynchronise le statut réel FedaPay.
- Un payout FedaPay `failed` recrédite le montant exactement débité.
- Un payout FedaPay `sent` clôture le retrait et la transaction miroir.
- L'opérateur et le montant payout sont conservés au moment de la demande de retrait.

##### Préproduction obligatoire

- Activer la fonctionnalité Payout sur le compte FedaPay.
- Configurer `FEDAPAY_SECRET_KEY` et `FEDAPAY_BASE_URL`.
- Tester en sandbox avant toute activation live.
- Vérifier les numéros Mobile Money et les méthodes `moov_tg` / `togocel`.

> **Note (octobre 2026) — SEC-45 n'est plus en vigueur.** Le workflow de retrait est
> aujourd'hui **manuel** : l'administrateur accepte la demande, le transfert Mobile Money
> est fait à la main, puis il confirme ou fait échouer le retrait (routes `accept`, `proof`,
> `confirm`, `fail`, `cancel`). Le payout FedaPay automatique et la route
> `POST /withdrawals/:id/sync` n'existent plus ; les méthodes de payout de `FedapayService`
> ont été retirées du code. SEC-41 à SEC-44 décrivent l'état intermédiaire du workflow
> avant le passage au manuel et sont conservés ici à titre d'historique.
