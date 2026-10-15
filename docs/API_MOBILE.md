# Contrat d'API pour l'équipe mobile : changements depuis `avant-refonte`

Ce document décrit ce qui change pour l'application mobile entre l'état d'avant la refonte (tag
`avant-refonte`) et l'état actuel du backend. Il est établi par comparaison des contrôleurs, des DTO
et des services (`git diff avant-refonte -- 'src/**/*.controller.ts'`), pas par des appels HTTP : en
cas de doute sur une forme de réponse, la référence est la documentation Swagger du backend
(`/docs`, protégée par mot de passe, schéma JSON sur `/api/v1/docs-json`).

Les routes sont toutes sous le préfixe **`/api/v1`**. Les routes marquées « web » ne concernent que
l'administration web et sont listées pour information.

## 0. Conventions

- **Authentification** : `Authorization: Bearer <accessToken>` (jeton mobile). Les routes « public »
  n'exigent aucun jeton.
- **Rôles de compte** (`UserRole`) : `STUDENT` (étudiant), `VENDOR` (vendeuse) et `ADMIN` (administrateur,
  accepté par les gardes de quelques routes, signalées avec leur rôle). Les écrans mobiles décrits ici
  concernent `STUDENT` et `VENDOR`.
- **Tickets** : 1 ticket = 1 FCFA. Tous les montants de commande sont en tickets (entiers).
- **Dates** : ISO 8601 en UTC (`2026-10-11T12:30:00.000Z`).
- **Pagination** : `?page=1&limit=10` ; réponse `{ "data": [...], "meta": { "page", "limit", "total", "totalPages" } }`.
- **Validation stricte** : un champ inconnu dans un corps de requête est refusé (400, « property X should not exist »). Les nombres d'un paramètre d'URL sont convertis ; un booléen d'URL n'accepte que `true` ou `false` (voir `GET /users`).
- **Erreurs** : `{ "statusCode", "message", "error" }` ; `message` est un texte (ou une liste de textes pour une validation).
- **Codes de succès** : `GET`, `PATCH` et `DELETE` répondent 200 ; tout `POST` répond **201**, y compris `POST /orders/:id/cancel` et `POST /scheduled-orders/:id/cancel` (le Swagger annonce 200 pour `POST /orders/:id/cancel`, ce qui est inexact). Seules certaines routes d'authentification forcent 200.
- **Prix** : le serveur calcule toujours le prix d'une commande. Aucun prix n'est accepté dans un corps de requête.

## 1. Changements majeurs à prendre en compte (résumé)

| Sujet | Avant | Maintenant |
|---|---|---|
| Statuts de commande | `PENDING, ACCEPTED, IN_PREPARATION, READY, RECEIVED, AUTO_RECEIVED, REFUSED, CANCELLED_VENDOR, CANCELLED_STUDENT, REFUNDED` | `CONFIRMED, IN_PREPARATION, READY, RECEIVED, CANCELLED` |
| Acceptation par la vendeuse | requise (`PENDING` puis `ACCEPTED`/`REFUSED`) | supprimée : la commande est **confirmée automatiquement** à la création |
| Paiement | tickets bloqués (séquestre), libérés à `READY` | tickets **débités à la création**, **remboursés intégralement** si annulée ; la vendeuse est **créditée à `READY`** |
| Contenu d'une commande | plats (`menuItemId`, composants, emballage) | **menus pré-composés** (`menuId`) et **composants libres** (`componentId`) |
| Sur place ou à emporter | emballage (`packagingOptionId`) | `consumptionMode` (`ON_SITE` ou `TAKEAWAY`) et `takeawayOptionId` |
| Ouverture de la cantine | `isOpen` et horaires | `capacityStatus` : `OPEN`, `BUSY`, `CLOSED` ; **plus d'horaires** |
| Annulation | étudiant seulement, tant que `PENDING` | étudiant (`CONFIRMED`, motif optionnel) ou vendeuse (`CONFIRMED`, `IN_PREPARATION`, **motif obligatoire**) |
| Numéro de commande | aucun | `orderNumber` par cantine (`A-00` à `Z-10`) |
| Litiges, créances, appels de retrait, transferts, ambassadeurs | présents | **supprimés** (voir partie 6) |
| Nouveautés | | commandes programmées, signalements, parrainage, composants/menus, ventes par période, notifications vendeuse |

### Énumérations

| Énumération | Valeurs |
|---|---|
| `OrderStatus` | `CONFIRMED`, `IN_PREPARATION`, `READY`, `RECEIVED`, `CANCELLED` |
| `ConsumptionMode` | `ON_SITE` (sur place), `TAKEAWAY` (à emporter) |
| `VendorCapacity` | `OPEN`, `BUSY`, `CLOSED` |
| `OrderCancelledBy` | `STUDENT`, `VENDOR` |
| `ComponentUnit` | `PORTION`, `UNIT`, `PIECE`, `BOTTLE`, `SACHET` |
| `ScheduledOrderStatus` | `PENDING`, `PLACED`, `FAILED`, `CANCELLED` |
| `ReportType` | `WRONG_MEAL`, `MISSING_COMPONENT`, `INCOMPLETE_ORDER`, `OTHER` |
| `ReportStatus` | `OPEN`, `IN_PROGRESS`, `RESOLVED` |
| `TransactionType` | `DEPOSIT`, `PAYMENT`, `SALE`, `REFUND`, `WITHDRAWAL`, `REFERRAL_BONUS` (supprimés : `ESCROW_LOCK`, `ESCROW_RELEASE`, `COMMISSION`, `AMBASSADOR_COMMISSION`, `DEBT_RECOVERY`, `TRANSFER`) |
| `NotificationType` | `INFO`, `SUCCESS`, `WARNING`, `ERROR` (inchangé) |

---

## 2. Commandes

### 2.1 `POST /orders` : modifiée (étudiant)

Rôle : `STUDENT`. Crée et **confirme** la commande en une seule opération (statut `CONFIRMED`).

Corps :

```json
{
  "vendorId": "uuid de la cantine",
  "consumptionMode": "ON_SITE",
  "takeawayOptionId": "uuid (obligatoire si TAKEAWAY, interdit si ON_SITE)",
  "items": [
    { "menuId": "uuid", "quantity": 2 },
    { "componentId": "uuid", "quantity": 1 }
  ]
}
```

- Chaque ligne désigne **un menu (`menuId`) ou un composant (`componentId`), jamais les deux ni aucun**. Un même menu ou composant n'apparaît que dans **une** ligne (regrouper les quantités). `items` : 1 à 50 lignes ; `quantity` : entier de 1 à 50 par ligne.
- Aucun prix dans le corps. Le serveur calcule : total = somme des (prix du menu ou du composant × quantité) + frais de l'option d'emporté.
- Ancien corps (`menuItemId`, `components`, `packagingOptionId`) : **refusé**.

Effets, dans une seule transaction : vérification de la cantine, déduction **atomique** du stock des composants (un menu consomme ses composants), attribution du numéro de commande, **débit du solde de l'étudiant**, transaction `PAYMENT`. Si une étape échoue, rien n'est écrit.

Réponse 201 : la commande créée, avec ses `items` (voir 2.5), **sans** `student`, `vendor` ni `takeawayOption` : `id`, `orderNumber`, `activeOrderNumber` (technique, égal à `orderNumber` tant que la commande est active : ne pas l'utiliser), `status: "CONFIRMED"`, `totalTickets`, `takeawayFeeTickets`, `consumptionMode`, `takeawayOptionId`, `vendorId`, `studentId`, `createdAt`, `updatedAt`, `readyAt: null`, `receivedAt: null`, `unclaimedAt: null`, `cancelledAt: null`, `cancelledBy: null`, `cancelledById: null`, `cancellationReason: null`, `refundedTickets: 0`, `deletedAt: null`.

Refus fréquents (400 sauf mention) :

| Message | Cas |
|---|---|
| `Cette cantine n'accepte pas de commandes actuellement` | cantine inactive |
| `Ce vendeur est fermé pour le moment` | `capacityStatus = CLOSED` |
| `Ce vendeur est momentanément indisponible` | `capacityStatus = BUSY` : plus de commande immédiate (les commandes programmées restent honorées) |
| `Menu "<nom>" indisponible : <composants> indisponible(s)` | menu actif dont un composant est supprimé, indisponible ou en stock inférieur à la quantité de la ligne |
| `Menu "<nom>" indisponible` | menu désactivé |
| `Composant "<nom>" indisponible` / `<composant> insuffisant` | composant indisponible ou à 0 ; stock insuffisant au moment de la déduction |
| 404 `Vendeur introuvable` / `Menu <id> introuvable` / `Composant <id> introuvable` | identifiant inconnu |
| `Le menu "<nom>" n'appartient pas à ce vendeur` / `Le composant "<nom>" n'appartient pas à ce vendeur` | article d'une autre cantine |
| `Un menu ne peut apparaître que dans une seule ligne : regroupez les quantités` (idem pour un composant) | doublon dans les lignes |
| `Solde insuffisant pour cette commande` | solde |
| `Chaque ligne doit désigner un menu ou un composant, pas les deux ni aucun` | forme des lignes |
| `Une option d'emporté est requise pour une commande à emporter` / `Une option d'emporté ne peut pas être choisie pour une commande sur place` | option d'emporté |
| 404 `Option d'emporté introuvable ou indisponible pour cette cantine` | option inconnue, d'une autre cantine, inactive ou supprimée |
| 409 `Cette cantine a atteint le nombre maximum de commandes en cours…` | les 286 numéros `A-00` à `Z-10` de la cantine sont tous attribués ; réessayer plus tard |

### 2.2 `PATCH /orders/:id` : modifiée (vendeuse)

Rôles : `VENDOR` uniquement (sa propre cantine). L'administration ne change pas le statut des commandes. Corps : `{ "status": "IN_PREPARATION" | "READY" | "RECEIVED" }`.

- Transitions **dans l'ordre strict** : `CONFIRMED` → `IN_PREPARATION` → `READY` → `RECEIVED`. Toute autre transition est refusée (400).
- `RECEIVED` (« Récupérée ») est posé **manuellement** par la vendeuse. Il n'y a plus de passage automatique.
- `CANCELLED` ne se pose **pas** par cette route : utiliser `POST /orders/:id/cancel`.
- Passage à `READY` : la vendeuse est **créditée** (une seule fois) du total de la commande, transaction `SALE`, `readyAt` renseigné.
- Réponse 200 : la commande à jour, avec ses seuls champs propres (**sans** `items` ni `student`, `vendor`, `takeawayOption`). Si le statut demandé est déjà le statut courant, rien n'est modifié et la commande est renvoyée avec la forme de `GET /orders/:id` (relations comprises).
- Refus (400) : `Transition de commande interdite : <statut actuel> → <statut demandé>` ; `Pour annuler une commande, utilisez POST /orders/:id/cancel` ; `La commande a été modifiée entre-temps` (requête simultanée). 403 : commande d'une autre cantine, ou compte étudiant.

### 2.3 `POST /orders/:id/cancel` : modifiée (étudiant et vendeuse)

Rôles : `STUDENT` **et maintenant `VENDOR`** (avant : étudiant seulement).

Corps : `{ "reason": "texte" }` (optionnel pour l'étudiant ; **obligatoire pour la vendeuse**, espaces de début et de fin retirés, 500 caractères au plus).

| Auteur | Statuts annulables |
|---|---|
| Étudiant (propriétaire) | `CONFIRMED` seulement |
| Vendeuse (sa cantine) | `CONFIRMED` et `IN_PREPARATION` |
| Les deux | **plus aucune annulation à partir de `READY`** |

Effets : statut `CANCELLED`, `cancelledBy` (`STUDENT` ou `VENDOR`), `cancellationReason` (si fourni), `cancelledAt`, **remboursement intégral en tickets** (`refundedTickets`, transaction `REFUND`), **stock restitué**, notifications étudiant « Commande annulée » puis « Remboursement ». Réponse **200** : `{ "order": { ... } }` (la commande annulée, champs propres seulement, sans `items`).

Refus : 400 `Un motif est obligatoire pour annuler une commande` (vendeuse sans motif), 400 `Cette commande est déjà annulée`, 400 `Vous ne pouvez annuler une commande que tant qu’elle est confirmée` (étudiant) ou `Une commande ne peut plus être annulée une fois prête ou récupérée` (vendeuse), 400 `La commande a été modifiée entre-temps : annulation impossible` (requête simultanée), 403 commande d'un autre étudiant ou d'une autre cantine, 404 commande introuvable.

Un administrateur n'annule jamais une commande (403).

### 2.4 `GET /orders`, `GET /orders/:id` : réponses modifiées

Mêmes routes ; la forme des commandes change. `GET /orders` renvoie `{ "data": [...], "meta": {...} }`, les plus récentes d'abord ; un étudiant ne voit que ses commandes, une vendeuse que celles de sa cantine. Filtres : `page`, `limit`, `status`, `statuses` (liste séparée par des virgules), `from`, `to` (dates ISO 8601, jour de `to` inclus, sur la date de création) ; `vendorId` et `campusId` ne s'appliquent qu'à l'administration. `GET /orders/:id` : 403 `Vous n'avez pas accès à cette commande`, 404 si absente.

Chaque commande des deux routes porte, en plus de ses champs propres : `items` (voir 2.5), `student` (`{ id, firstName, lastName, campus: { id, name } }`), `vendor` (`{ id, canteenName }`) et `takeawayOption` (`{ id, name }` ou `null`).

- Disparus : `escrowAmount`, `packagingOptionId`, `reason`, `confirmedAt`, les statuts `PENDING`, `ACCEPTED`, `REFUSED`, `AUTO_RECEIVED`, `CANCELLED_*`, `REFUNDED`.
- Nouveaux : `orderNumber` (par exemple `A-05`), `activeOrderNumber` (technique, ne pas l'utiliser), `consumptionMode`, `takeawayOptionId`, `takeawayFeeTickets`, `unclaimedAt`, `cancelledBy`, `cancelledById`, `cancellationReason`, `cancelledAt`, `refundedTickets`.
- Le **numéro de commande** est propre à la cantine : unique parmi ses commandes **actives**, il est réutilisé dès que la commande est `RECEIVED` ou `CANCELLED`. Il va de `A-00` à `Z-10`. Ne jamais l'utiliser comme identifiant : utiliser `id`.
- `unclaimedAt` : date de signalement « non récupérée » (voir 2.6) ou `null`.

### 2.5 Lignes d'une commande (`items`)

```json
{
  "id": "uuid",
  "orderId": "uuid",
  "menuId": "uuid ou null",
  "componentId": "uuid ou null",
  "name": "Menu Poulet",
  "quantity": 2,
  "unitPrice": 1000,
  "createdAt": "2026-10-11T12:30:00.000Z",
  "updatedAt": "2026-10-11T12:30:00.000Z",
  "components": [
    {
      "id": "uuid", "orderItemId": "uuid", "componentId": "uuid", "quantity": 2,
      "createdAt": "2026-10-11T12:30:00.000Z", "updatedAt": "2026-10-11T12:30:00.000Z",
      "component": { "name": "Poulet", "unit": "PORTION" }
    }
  ]
}
```

Une ligne porte soit `menuId`, soit `componentId`. `components` détaille les composants consommés (nom et unité dans `component`) ; leur `quantity` est le **total d'unités consommées** pour la ligne (quantité du composant dans le menu × quantité commandée). Pour une ligne de composant libre, `components` contient ce seul composant.

### 2.6 Commandes non récupérées (`unclaimedAt`)

Une commande restée `READY` plus de **60 minutes** après `readyAt` (réglable côté serveur) reçoit `unclaimedAt`. Le contrôle passe toutes les 15 minutes : le signalement peut donc arriver jusqu'à 15 minutes après le délai. Aucune notification, aucune sanction, aucun changement de statut : c'est une donnée de mesure. Elle reste renseignée si la commande passe ensuite à `RECEIVED`.

---

## 3. Commandes programmées (nouveau, étudiant)

Rôle : `STUDENT`. Une commande programmée est un enregistrement à part : **aucun débit, aucun stock, aucun numéro** avant l'heure prévue.

| Route | Description |
|---|---|
| `POST /scheduled-orders` | programmer une commande |
| `GET /scheduled-orders?status=&page=&limit=` | mes commandes programmées (jamais celles des autres) |
| `GET /scheduled-orders/:id` | détail (404 si absente ou à un autre étudiant) |
| `POST /scheduled-orders/:id/cancel` | annuler, **sans motif**, tant qu'elle est `PENDING` (400 sinon) |

Corps de `POST /scheduled-orders` :

```json
{
  "vendorId": "uuid",
  "scheduledFor": "2026-10-11T12:30:00Z",
  "consumptionMode": "ON_SITE",
  "takeawayOptionId": "uuid (si TAKEAWAY)",
  "items": [ { "menuId": "uuid", "quantity": 1 } ]
}
```

- `scheduledFor` : ISO 8601 **avec fuseau horaire obligatoire** (`Z` ou `+01:00`) ; entre **15 minutes et 24 heures** dans le futur.
- **5 commandes en attente au maximum** par étudiant.
- Contrôlés à la programmation : forme des lignes, existence et appartenance des menus, composants et de l'option d'emporté à la cantine, cantine active et non `CLOSED` (`OPEN` et `BUSY` acceptés). **Non contrôlés** : stock, disponibilité, prix, solde.
- Refus (400) : `L'heure prévue doit être au moins 15 minutes dans le futur`, `…au plus 24 heures dans le futur`, `scheduledFor doit comporter un fuseau horaire (ex : 2026-10-11T12:30:00Z)`, `Vous avez déjà 5 commandes programmées en attente`, `Cette cantine n'accepte pas de commandes actuellement` (cantine inactive), `Ce vendeur est fermé pour le moment`, 404 `Vendeur introuvable`, les refus de forme des lignes et de l'option d'emporté de `POST /orders`, plus les refus d'articles : 404 `Menu <id> introuvable`, 400 `Le menu "<nom>" n'appartient pas à ce vendeur`, 400 `Menu "<nom>" indisponible` (menu désactivé), 404 `Composant <id> introuvable`, 400 `Le composant "<nom>" n'appartient pas à ce vendeur`, 404 `Option d'emporté introuvable ou indisponible pour cette cantine`.

`POST /scheduled-orders` et `POST /scheduled-orders/:id/cancel` répondent **201** ; `POST /scheduled-orders/:id/cancel` renvoie la commande programmée à jour (400 `Seule une commande programmée en attente peut être annulée. Une commande déjà passée suit les règles d'annulation des commandes.` si elle n'est plus en attente). `GET /scheduled-orders` renvoie `{ "data": [...], "meta": {...} }` (en attente : la plus proche d'abord ; sinon la plus récente d'abord).

Objet renvoyé : `id`, `studentId`, `vendorId`, `scheduledFor`, `consumptionMode`, `takeawayOptionId`, `items` (`[{ menuId?, componentId?, quantity }]`), `status`, `orderId`, `failureReason`, `processedAt`, `cancelledAt`, `createdAt`, `updatedAt`, `vendor: { id, canteenName }`, `order: { id, orderNumber, status }` (null tant que non passée).

Exécution (côté serveur, toutes les 5 minutes, avec un retard possible de quelques minutes, 20 commandes au plus par passage) : à l'heure prévue la commande est créée par la même logique que `POST /orders`, **avec une différence : une cantine `BUSY` est acceptée**. Succès : `PLACED` avec `orderId`, notification « Commande confirmée ». Échec (cantine `CLOSED` ou inactive, stock insuffisant, solde insuffisant, article supprimé…) : `FAILED` avec `failureReason`, rien n'est débité, notification « Commande programmée non passée ». Une commande `PLACED` suit ensuite les règles d'une commande normale (annulation selon le rôle, etc.).

---

## 4. Cantine, composants, menus, options d'emporté

### 4.1 Statut de capacité (`capacityStatus`)

- `GET /vendors/me` (vendeuse) et les fiches publiques de cantine renvoient `capacityStatus` (`OPEN`, `BUSY`, `CLOSED`). **Disparus** : `isOpen`, `debtFcfa`, les horaires.
- `PATCH /vendors/me` : le corps accepte `capacityStatus` (remplace `isOpen`) ainsi que `canteenName`, `logoUrl`, `bannerUrl` et `description`. Les champs `isActive`, `suspensionReason` et `campusIds` passent la validation mais sont **ignorés** sur cette route. 403 `Compte vendeur inactif — modification impossible` si la cantine est inactive. Réponse 200 : la cantine à jour (champs propres, dont `userId`), `balanceFcfa` en nombre, sans `campuses`.
- Les fiches publiques (`GET /vendors`, `GET /vendors/:id`) renvoient `id`, `canteenName`, `logoUrl`, `bannerUrl`, `description`, `isActive`, `capacityStatus`, `createdAt`.
- Effets : `OPEN` accepte tout ; `BUSY` n'accepte plus de commande **immédiate** mais honore les commandes **programmées** ; `CLOSED` bloque tout, programmées comprises.
- Le profil `GET /vendors/me` renvoie : `id`, `userId`, `canteenName`, `logoUrl`, `bannerUrl`, `description`, `balanceFcfa` (nombre, solde disponible), `pendingAmountTickets` (montants en attente : commandes `CONFIRMED` / `IN_PREPARATION`), `pendingOrdersCount`, `isActive`, `capacityStatus`, `suspendedAt`, `suspensionReason`, `createdAt`, `updatedAt`, `user: { phone }`, `campuses` (`[{ id, name, city, institution }]`), `campusName` (premier campus) et `phone`.

### 4.2 Composants et catégories (nouveau)

Gestion : rôles `VENDOR` (sa cantine) ; l'administration web peut aussi gérer (`ADMIN` web).

| Méthode et chemin | Rôles | Rôle de la route |
|---|---|---|
| `GET /components/:vendorId` | public | liste publique des composants d'une cantine |
| `GET /components/manage/:vendorId` | `VENDOR`, web `ADMIN` | liste de gestion (avec quantités ; 403 pour la cantine d'une autre vendeuse) |
| `POST /components` | `VENDOR`, web `ADMIN` | créer |
| `PATCH /components/:id` | idem | modifier |
| `PATCH /components/:id/stock` | idem | ajuster le stock : `{ "delta": -4 }` (entier non nul de -1 000 000 à 1 000 000, négatif = retrait) ; réponse 200 `{ id, quantity }` ; 409 `Stock insuffisant : <n> disponible(s), retrait de <m> demandé` si le retrait dépasse le stock |
| `DELETE /components/:id` | idem | supprimer (suppression logique) ; 409 si un menu non supprimé l'utilise |
| `GET /component-categories/:vendorId` | public | catégories non supprimées (`id`, `vendorId`, `name`, `createdAt`, `updatedAt`, `deletedAt`) |
| `POST`, `PATCH /:id`, `DELETE /:id` `/component-categories` | `VENDOR`, web `ADMIN` | gérer les catégories : corps `{ "vendorId"? (ignoré pour une vendeuse), "name" (60 caractères au plus) }` ; `DELETE` : 409 s'il reste des composants dans la catégorie |

Corps de `POST /components` : `{ "vendorId"? (ignoré pour une vendeuse, obligatoire pour un administrateur), "categoryId"?, "name" (60 caractères au plus), "unit" (ComponentUnit), "quantity"?, "priceTickets"?, "isAvailable"?, "lowStockThreshold"? }` (entiers de 0 à 1 000 000). `PATCH /components/:id` accepte les mêmes champs, tous facultatifs, **sauf** `vendorId` et `quantity` (refusés en 400 : la quantité ne change que par `PATCH /components/:id/stock`) ; `categoryId` et `lowStockThreshold` peuvent valoir `null`. `PATCH /components/:id/stock` : `{ "delta": entier non nul }`, positif pour un ajout, négatif pour une correction.

Un composant (vue de gestion, `POST` et `PATCH` compris) : `id`, `vendorId`, `categoryId`, `name`, `unit` (`ComponentUnit`), `quantity`, `priceTickets`, `isAvailable`, `lowStockThreshold`, `createdAt`, `updatedAt`, `deletedAt`. `isAvailable` est le réglage de la vendeuse : il n'est **jamais modifié automatiquement**. La disponibilité effective est **calculée** : `available = isAvailable et quantity > 0`.

La liste **publique** (`GET /components/:vendorId`) renvoie, pour chaque composant non supprimé (y compris indisponible), exactement `id`, `name`, `categoryId`, `unit`, `priceTickets` et `available`. Elle ne renvoie **ni `quantity`, ni `isAvailable`, ni `lowStockThreshold`** : la quantité en stock n'est pas visible des étudiants.

### 4.3 Menus pré-composés (nouveau)

| Méthode et chemin | Rôles | Rôle de la route |
|---|---|---|
| `GET /menus/:vendorId` | public | menus actifs d'une cantine, avec disponibilité |
| `GET /menus/manage/:vendorId` | `VENDOR`, web `ADMIN` | liste de gestion |
| `POST /menus` | `VENDOR`, web `ADMIN` | créer : `{ "vendorId"? (ignoré pour une vendeuse), "name" (60 caractères au plus), "description"? (500 au plus), "isActive"?, "lines": [{ "componentId", "quantity"? (1 à 100, 1 par défaut) }] }` avec 1 à 50 lignes, un composant par ligne au plus ; réponse 201 : la vue de gestion |
| `PATCH /menus/:id` | idem | modifier (mêmes champs sauf `vendorId`, tous facultatifs ; `description` peut valoir `null`) ; les lignes, si fournies, sont **remplacées atomiquement** ; réponse 200 : la vue de gestion |
| `DELETE /menus/:id` | idem | supprimer (suppression logique) ; réponse 200 `{ "id": "uuid", "deleted": true }` |

Vue publique d'un menu : `id`, `name`, `description`, `priceTickets` (somme des composants), `available` (vrai si le menu est actif et qu'aucun composant n'est manquant), `missingComponents` (**tableau d'objets `{ "id", "name" }`**, pas de simples noms : composants supprimés, indisponibles ou en stock inférieur à la quantité de la ligne), `lines: [{ componentId, name, unit, quantity }]` (triées par nom de composant). La vue de gestion (`GET /menus/manage/:vendorId`, `POST`, `PATCH`) ajoute `vendorId`, `isActive`, `createdAt` et `updatedAt`. Un menu `available: false` ne peut pas être commandé immédiatement ; il peut être programmé (le contrôle de disponibilité se fait à l'heure prévue).

### 4.4 Options d'emporté (nouveau)

| Méthode et chemin | Rôles | Rôle de la route |
|---|---|---|
| `GET /catalog/takeaway-options/:vendorId` | public | options actives d'une cantine (paginé) |
| `GET /catalog/takeaway-options/manage/:vendorId` | `VENDOR`, web `ADMIN` | liste de gestion, actives ou non (paginé) |
| `POST /catalog/takeaway-options` | idem | créer : `{ "vendorId"? (ignoré pour une vendeuse), "name" (60 caractères au plus), "priceTickets" (entier ≥ 0), "isActive"? }` |
| `PATCH /catalog/takeaway-options/:id` | idem | modifier (mêmes champs sauf `vendorId`, tous facultatifs) |
| `DELETE /catalog/takeaway-options/:id` | idem | supprimer (suppression logique) |

Une option : `id`, `vendorId`, `name`, `priceTickets` (frais ajoutés au total d'une commande **à emporter**), `isActive`, `createdAt`, `updatedAt`, `deletedAt`. Les deux listes renvoient `{ "data": [...], "meta": {...} }`.

Les routes de plats, de composants de plat et d'emballages `/catalog/menu-items`, `/catalog/menu-components`, `/catalog/packaging-options` sont **supprimées** (partie 6).

---

## 5. Autres routes nouvelles ou modifiées

### 5.1 Ventes par période : `GET /vendors/me/sales` (nouveau, vendeuse)

Rôle `VENDOR`. Paramètres : `from`, `to` (ISO 8601, jours UTC, par défaut les 30 derniers jours, 366 jours au plus), `groupBy` (`day` par défaut, `week` du lundi au dimanche, `month`).

```json
{
  "from": "2026-09-12T00:00:00.000Z", "to": "2026-10-11T23:59:59.999Z", "groupBy": "day",
  "summary": { "creditedOrders": 42, "collectedTickets": 61500, "cancelledOrders": 3, "refundedTickets": 4200 },
  "periods": [
    { "periodStart": "2026-10-11T00:00:00.000Z", "creditedOrders": 5, "collectedTickets": 7000, "cancelledOrders": 0, "refundedTickets": 0 }
  ]
}
```

`creditedOrders` et `collectedTickets` comptent les commandes **créditées à `READY`** (par date de passage à `READY`) ; `cancelledOrders` et `refundedTickets` les commandes annulées (par date d'annulation). Chaque période de l'intervalle est présente, même à zéro.

### 5.2 Signalements (nouveau)

Rôle `STUDENT` pour créer et lire les siens.

| Route | Description |
|---|---|
| `POST /reports` | `{ "orderId", "type", "comment"? }` (`comment` : 500 caractères au plus, espaces de début et de fin retirés) ; réponse 201 |
| `GET /reports?page=&limit=&status=&type=&orderId=&from=&to=&days=` | mes signalements (paginé, filtrables ; chaque signalement porte aussi `student`, `vendor` et `order` : voir plus bas) |
| `GET /reports/:id` | détail de mon signalement (le signalement seul) |

Règles : seulement sur **sa propre commande `READY` ou `RECEIVED`** ; `comment` obligatoire si `type = OTHER` ; **un seul signalement non traité par commande**. Un signalement **ne rembourse rien et ne change aucun statut**. Refus : 404 commande inconnue, 403 `Vous ne pouvez signaler un problème que sur vos propres commandes`, 400 `Vous ne pouvez signaler un problème que sur une commande prête ou récupérée`, 400 `Un commentaire est obligatoire pour signaler un autre problème`, 409 `Un signalement est déjà en cours de traitement pour cette commande`.

Objet (`POST /reports` et `GET /reports/:id` côté étudiant) : `id`, `orderId`, `studentId`, `vendorId`, `type`, `comment`, `status` (`OPEN`, `IN_PROGRESS`, `RESOLVED`), `treatedByWebUserId` (`null` tant qu'un administrateur n'a pas traité le signalement ; identifiant interne, à ne pas afficher), `createdAt`, `resolvedAt`. Il n'y a **pas** de champ `updatedAt`.

Dans la liste `GET /reports` : `{ "data": [...], "meta": {...} }`, les plus récents d'abord ; chaque signalement contient en plus `student` (`{ id, firstName, lastName, campus: { id, name } }`), `vendor` (`{ id, canteenName }`) et `order` (`{ id, orderNumber, createdAt }`). `GET /reports/:id` renvoie le signalement seul, sans ces relations.

### 5.3 Parrainage (nouveau)

- Tout utilisateur reçoit **automatiquement** un `referralCode` unique à la création de son compte : 8 caractères, majuscules et chiffres, sans `0`, `O`, `1`, `I` (exemple `K7M2QX9A`). Il est renvoyé dans le profil (`GET /users/me`) et dans la réponse d'authentification (`user.referralCode`).
- `GET /referrals/me` (tout utilisateur connecté) : `{ "referralCode", "referredCount", "rewardedCount", "totalRewardTickets" }`.
- **La saisie d'un code se fait toujours à l'inscription**, par le champ `referralCode` (facultatif) de `POST /auth/verify-otp`. Aucune route ne permet d'ajouter, modifier ou retirer un parrain ensuite : le lien est définitif. Le code est comparé sans tenir compte de la casse ni des espaces ; une chaîne vide est ignorée ; un code inconnu est refusé en 400 `Code de parrainage invalide ou inexistant`. Ce champ est ignoré quand un compte existant se reconnecte.

### 5.3 bis Authentification étudiant — PIN (PWA)

Parcours aligné sur le vendeur, sans mot de passe temporaire :

1. **Première connexion / PIN oublié** : `POST /auth/send-otp` → `POST /auth/verify-otp` (campus + parrainage à l’inscription). Pour un compte `STUDENT`, la réponse n’émet **plus** de tokens de session : `{ "stage": "PIN_SETUP_REQUIRED", "pinSetupToken", "pinLength": 4, "phoneMasked" }`.
2. **Pose du PIN** : `POST /auth/student/set-pin` `{ pinSetupToken, pin }` (4 chiffres, refus des PIN triviaux type `0000` / `1234`). Réponse : `user` + `accessToken` + `refreshToken`.
3. **Connexions suivantes** : `POST /auth/student/login-pin` `{ phone, pin }` — sans SMS. Après 5 échecs : verrouillage 15 min (403).

Les jetons d’étape portent un `scope` (`student_pin_setup`) et sont **refusés** par `JwtStrategy` comme access token. Le profil (`GET /users/me`) expose `hasPin` (booléen), jamais le hash.
- **Récompense** : quand le filleul fait sa **première recharge réussie**, le parrain reçoit **100 tickets** (transaction `REFERRAL_BONUS`, notification), **une seule fois par filleul**. Pas de coupon en V1.
- Supprimés : `POST /ambassadors/apply`, `POST /ambassadors/school-card`, `GET /ambassadors`, `GET /ambassadors/me`, `PATCH /ambassadors/:id`, et le champ `notifyAmbassador` du profil.

### 5.4 Utilisateurs et transactions (web, pour information)

- `GET /users` (web) : le paramètre `isSuspended` n'accepte que `true` ou `false` ; toute autre valeur est refusée en 400 (avant, « false » était lu comme vrai).
- `GET /transactions/stats` (web : administration et supervision) : la clé `escrow` est **renommée `pending`** (`{ total, count }`, mêmes valeurs : commandes `CONFIRMED` et `IN_PREPARATION`). Clés actuelles : `transactionsToday`, `pending`, `debitsCompleted`, `refunds`. **Supprimée** : `activeDebts`.
- `GET /transactions` : les types possibles sont ceux de `TransactionType` ci-dessus.
- `GET /reviews` (web) : accessible désormais à la supervision **et à l'administration web** (avant la refonte : supervision seule).

### 5.5 Routes web ajoutées (pour information)

`GET /admin/analytics/orders-summary` et `GET /admin/analytics/stock` (indicateurs d'administration et suivi du stock, administration et supervision) ; `GET /reports/stats`, `GET /reports`, `GET /reports/:id`, `PATCH /reports/:id` (traitement des signalements : `PATCH` réservé à l'administrateur, corps `{ status }` seulement) ; routes internes de cron `POST /internal/cron/scheduled-orders`, `unclaimed-orders`, `scheduling-reminders` (protégées par `CRON_SECRET`, jamais appelées par le mobile).

---

## 6. Routes supprimées (43)

Le mobile ne doit plus appeler ces routes (elles répondent 404).

| Domaine | Routes supprimées | Remplacement |
|---|---|---|
| Plats | `GET/POST /catalog/menu-items`, `GET/PATCH/DELETE /catalog/menu-items/:id` | menus (`/menus`) et composants (`/components`) |
| Composants de plat | `POST /catalog/menu-components`, `GET /catalog/menu-components/:itemId`, `GET /catalog/menu-components/detail/:id`, `PATCH/DELETE /catalog/menu-components/:id` | `/components` |
| Emballages | `POST /catalog/packaging-options`, `GET /catalog/packaging-options/:itemId`, `GET /catalog/packaging-options/detail/:id`, `PATCH/DELETE /catalog/packaging-options/:id` | options d'emporté (`/catalog/takeaway-options`) |
| Horaires | `GET/POST /vendors/:vendorId/schedules`, `DELETE /vendors/:vendorId/schedules/:id` | `capacityStatus` |
| Remboursement vendeuse | `POST /orders/:id/refund` | `POST /orders/:id/cancel` (motif obligatoire pour la vendeuse) |
| Transferts | `POST /wallet/send` | aucun (fonction supprimée) |
| Litiges | `POST /disputes`, `GET /disputes`, `GET /disputes/stats`, `GET /disputes/:id`, `GET /disputes/:id/context`, `PATCH /disputes/:id` | signalements (`/reports`) |
| Créances | `GET /transactions/debts` | aucun |
| Appels sur retraits | `POST /withdrawals/:id/appeal`, `PATCH /withdrawals/appeals/:appealId/resolve` | aucun |
| Ambassadeurs | `POST /ambassadors/apply`, `POST /ambassadors/school-card`, `GET /ambassadors`, `GET /ambassadors/me`, `PATCH /ambassadors/:id`, `GET /admin/analytics/ambassadors`, `GET /admin/analytics/ambassadors/:id` | parrainage (`referralCode`, `GET /referrals/me`) |
| Filières | `GET/POST /campuses/:campusId/faculties`, `PATCH /campuses/:campusId/faculties/:id` | aucun |
| Statistiques de campus | `GET /admin/analytics/campuses` | indicateurs d'administration |
| Crons | `POST /internal/cron/ambassador-daily`, `orders-timeout`, `withdrawals-auto-confirm` | crons `scheduled-orders`, `unclaimed-orders`, `scheduling-reminders` |

---

## 7. Notifications (textes)

Les notifications sont créées dans l'application (liste) et envoyées en push. Titres et messages exacts :

| Destinataire | Déclencheur | Titre | Message | Type |
|---|---|---|---|---|
| Étudiant | commande confirmée | Commande confirmée | `Ta commande chez <cantine> est confirmée.` | `SUCCESS` |
| Étudiant | passage à `IN_PREPARATION` | Commande en préparation | `<cantine> prépare ta commande.` | `INFO` |
| Étudiant | passage à `READY` | Commande prête | `Ta commande chez <cantine> est prête. Va la récupérer.` | `SUCCESS` |
| Étudiant | annulation | Commande annulée | `Ta commande chez <cantine> a été annulée.` | `WARNING` |
| Étudiant | remboursement (après annulation) | Remboursement | `<n> ticket(s) ont été recrédités sur ton portefeuille.` | `SUCCESS` |
| Vendeuse | nouvelle commande (immédiate ou programmée exécutée) | Nouvelle commande | `Commande A-05 (sur place).` ou `Commande A-05 (à emporter).` | `INFO` |
| Vendeuse | un composant passe de « au moins le seuil » à « sous le seuil » (commande ou retrait de stock) | Stock faible | `<composant> : il ne reste que <n> en stock.` | `WARNING` |
| Étudiant | commande programmée en échec | Commande programmée non passée | `Ta commande programmée chez <cantine> n'a pas pu être passée (<motif>). Aucun ticket n'a été débité.` | `WARNING` |
| Étudiant (non suspendu, compte non supprimé) | rappel tous les 3 jours (passage quotidien à 7 h UTC) | Programme ton repas | `Tu peux programmer ta commande avant de sortir : choisis ton repas et l'heure à laquelle tu le veux.` | `INFO` |
| Parrain | première recharge réussie du filleul | Bonus de parrainage | `100 tickets ont été ajoutés à ton portefeuille : ton filleul vient de faire sa première recharge.` | `SUCCESS` |
| Utilisateur | recharge réussie | Recharge réussie | `<n> tickets ont été ajoutés à ton portefeuille.` | `SUCCESS` |
| Utilisateur | recharge échouée | Recharge échouée | `Le paiement Mobile Money n’a pas abouti. Tes tickets n’ont pas été débités. Tu peux réessayer.` | `ERROR` |

Les notifications existantes de retrait de la vendeuse (demande reçue, acceptée, envoyée, annulée ou non aboutie) ne sont pas détaillées ici. Il n'existe **aucune** notification de remboursement séparée : le message d'annulation précise le remboursement. Aucune notification n'est envoyée pour une commande « non récupérée ».

---

## 8. Ce qui n'a pas changé

Authentification par OTP (`/auth/*`), profil (`/users/me`), campus (`GET /campuses`), recharges Mobile Money (`/payments/*`), retraits de la vendeuse (hors appels), notifications (`/notifications`), preuve de retrait. Les routes et les gardes de rôles de ces contrôleurs sont inchangés par rapport à `avant-refonte`, à l'exception des retraits (routes d'appel supprimées) ; seul le contenu de certaines réponses évolue (par exemple `referralCode` dans le profil). Les avis (`/reviews`) ne figurent pas dans cette liste : l'accès web de `GET /reviews` a changé (voir 5.4).
