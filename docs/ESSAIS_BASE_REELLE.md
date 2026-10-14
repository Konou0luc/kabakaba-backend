# Essais sur une vraie base (à faire avant l'ouverture aux utilisateurs)

Les essais ci-dessous vérifient, sur **PostgreSQL réel (Neon)**, les comportements qui reposent sur le
moteur de base de données : verrous de ligne, mises à jour conditionnelles, contraintes uniques,
transactions et durée d'exécution. Les tests automatiques écrits pendant la refonte tournaient sur un
PostgreSQL local, sans le pooler ni la latence de Neon, et ne simulaient pas la limite de 30 secondes de
Vercel : ces essais restent donc nécessaires.

**Cette liste n'a pas encore été exécutée.** Chaque essai donne un résultat attendu ; noter le résultat
constaté dans la dernière colonne du tableau de la fin du document.

## 0. Préparation

- **Environnement** : une branche Neon **dédiée aux essais**, créée à partir de la base migrée (voir
  `docs/MIGRATION.md`), et un déploiement de l'API pointant dessus (ou l'API en local avec cette base).
  Ne pas lancer ces essais sur la base de production une fois des utilisateurs réels présents.
- **Variables** : `export API="https://<hôte>/api/v1"`, `export CRON_SECRET="…"` (même valeur que sur
  Vercel), `export DB="postgresql://…"` (URL directe de la base d'essai pour `psql`).
- **Jeu de données** (via l'API ou le web d'administration) : une cantine `Cantine Essai` avec une
  vendeuse ; des composants (`Riz`, `Poulet`, `Sauce`) ; un menu `Menu Poulet` (Riz + Poulet) ; une option
  d'emporté ; **trois étudiants** `A`, `B`, `C` avec un solde de 50 000 tickets chacun (recharge ou
  `UPDATE "User" SET "walletBalance" = 50000 WHERE …` sur la base d'essai) ; la vendeuse `V`. Garder les
  jetons : `TOKEN_A`, `TOKEN_B`, `TOKEN_C`, `TOKEN_V`.
- **Requêtes simultanées** : lancer deux (ou N) appels au même instant, par exemple :
  ```bash
  call() { curl -s -o /dev/null -w "%{http_code} " -X POST "$API/orders" \
    -H "Authorization: Bearer $1" -H "Content-Type: application/json" -d "$2"; }
  BODY='{"vendorId":"<id>","consumptionMode":"ON_SITE","items":[{"componentId":"<id riz>","quantity":1}]}'
  call "$TOKEN_A" "$BODY" & call "$TOKEN_B" "$BODY" & wait; echo
  ```
  Pour davantage de simultanéité : `seq 20 | xargs -P20 -I{} curl …` ou l'outil `k6`/`hey`.
- **Répéter** chaque essai de concurrence **au moins 20 fois** : une condition de course n'apparaît pas
  à chaque tentative.
- **Convention** : les identifiants entre chevrons sont à remplacer ; les noms de tables et de colonnes
  PostgreSQL sont entre guillemets doubles. La session Neon est en UTC ; les colonnes de date sont sans fuseau et
  comparées à `now()` (UTC).
- **Contrôle des extraits SQL** : les requêtes de ce document ont été exécutées sur un PostgreSQL 16 local (schéma
  actuel plus l'index partiel) pour en vérifier la syntaxe et les noms de colonnes. Les essais eux-mêmes n'ont pas
  été exécutés.

---

## 1. Déduction atomique du stock (dernier composant)

- **Préparation** : `Riz` à `quantity = 1`. `A` et `B` commandent chacun 1 `Riz` (`POST /orders`).
- **Action** : les deux `POST /orders` partent **en même temps**.
- **Résultat attendu** : exactement **une** réponse `201` et **une** réponse `400` « `Riz insuffisant` » (ou
  « `Composant "Riz" indisponible` » si la lecture arrive après la déduction). Jamais deux `201`.
- **Vérifications** :
  ```sql
  SELECT quantity, "isAvailable" FROM "Component" WHERE id = '<id riz>';          -- quantity = 0, jamais négative
  SELECT count(*) FROM "Order" WHERE "vendorId" = '<id>' AND status = 'CONFIRMED'; -- 1 commande pour ce Riz
  SELECT id, "walletBalance" FROM "User" WHERE id IN ('<A>','<B>');               -- le perdant n'est pas débité
  ```
- **Vue étudiante (sans jeton)** : `GET $API/components/<id cantine>` : `Riz` apparaît avec `available: false`, et
  **aucune** réponse de cette route ne contient les clés `quantity`, `isAvailable` ni `lowStockThreshold` (la quantité
  n'est pas visible des étudiants ; seule la liste de gestion, avec le jeton `V`, la renvoie).
  ```bash
  curl -s "$API/components/<id cantine>" | grep -c -E '"(quantity|isAvailable|lowStockThreshold)"'   # 0
  ```
- **Échec si** : stock négatif, deux commandes confirmées, un étudiant débité sans commande, ou une clé `quantity`,
  `isAvailable` ou `lowStockThreshold` dans la liste publique des composants.

## 2. Numérotation : attribution, libération, simultanéité

- **Action 1 (attribution)** : créer 3 commandes successives sur la même cantine. **Attendu** : `A-00`,
  `A-01`, `A-02` (plus petit numéro libre).
- **Action 2 (libération)** : passer la commande `A-00` à `IN_PREPARATION`, `READY`, puis `RECEIVED` ; créer une
  nouvelle commande. **Attendu** : elle reçoit `A-00` (numéro réutilisé). Même résultat après une annulation.
  ```sql
  SELECT "orderNumber", "activeOrderNumber", status FROM "Order" WHERE "vendorId" = '<id>' ORDER BY "createdAt";
  -- activeOrderNumber est NULL pour RECEIVED et CANCELLED
  ```
- **Action 3 (simultanéité)** : 10 `POST /orders` simultanés sur la même cantine (étudiants différents ou
  même étudiant). **Attendu** : 10 numéros **distincts** consécutifs ; aucune erreur 500.
  ```sql
  SELECT "activeOrderNumber", count(*) FROM "Order" WHERE "vendorId" = '<id>' AND "activeOrderNumber" IS NOT NULL
  GROUP BY 1 HAVING count(*) > 1;   -- 0 ligne
  ```
- **Échec si** : deux commandes actives avec le même numéro, ou une réponse 500 (violation de la contrainte
  `Order_vendorId_activeOrderNumber_key`, qui ne doit servir que de filet).
- **Limite (facultatif)** : créer 286 commandes actives sur une cantine puis une 287e. **Attendu** : `409`
  « `Cette cantine a atteint le nombre maximum de commandes en cours (286)…` », rien débité.

## 3. Crédit de la vendeuse à `READY`, une seule fois

- **Préparation** : une commande `IN_PREPARATION` de `T` tickets ; noter `balanceFcfa` de la cantine.
- **Action** : deux `PATCH /orders/<id>` `{"status":"READY"}` **simultanés** (jeton `V`).
- **Résultat attendu** : une réponse `200`, l'autre `400` (transition refusée). `balanceFcfa` augmente de
  **`T` une seule fois**.
  ```sql
  SELECT "balanceFcfa" FROM "Vendor" WHERE id = '<id>';
  SELECT count(*) FROM "Transaction" WHERE "relatedOrderId" = '<commande>' AND type = 'SALE';   -- 1
  SELECT "readyAt" FROM "Order" WHERE id = '<commande>';                                         -- renseigné
  ```
- **Échec si** : deux transactions `SALE`, ou un solde crédité deux fois.
- **Variante** : passer ensuite à `RECEIVED` : aucun nouveau crédit (`SALE` toujours à 1).

## 4. Annulation : restitution du stock et remboursement, une seule fois

- **Préparation** : commande `CONFIRMED` de `T` tickets consommant des composants ; noter le solde de
  l'étudiant et les quantités.
- **Action** : deux `POST /orders/<id>/cancel` `{"reason":"essai"}` **simultanés** (même jeton étudiant).
- **Résultat attendu** : une réponse `200`, l'autre `400`. Remboursement de **`T` une seule fois** ; stock
  restitué **une seule fois**.
  ```sql
  SELECT status, "refundedTickets", "cancelledBy", "cancellationReason" FROM "Order" WHERE id = '<commande>';
  SELECT count(*) FROM "Transaction" WHERE "relatedOrderId" = '<commande>' AND type = 'REFUND';   -- 1
  SELECT quantity FROM "Component" WHERE id IN ('<riz>','<poulet>');                              -- retour à la valeur d'avant la commande, pas au-delà
  ```
- **Variantes** : annulation par la vendeuse en `IN_PREPARATION` (200) ; annulation d'une commande `READY`
  (400) ; annulation sans `reason` (400) ; **annulation de l'étudiant simultanée à un passage `IN_PREPARATION`
  de la vendeuse** : un seul des deux l'emporte, jamais un état incohérent (remboursement et préparation).
- **Échec si** : deux transactions `REFUND`, stock supérieur à l'initial, solde supérieur à l'initial.

## 5. Exécution simultanée d'une commande programmée

- **Préparation** : `POST /scheduled-orders` (heure à +16 minutes) pour `A`. Avancer l'heure sans attendre :
  ```sql
  UPDATE "ScheduledOrder" SET "scheduledFor" = now() - interval '1 minute' WHERE id = '<id>';
  ```
- **Action** : trois appels simultanés de la route de cron :
  ```bash
  for i in 1 2 3; do curl -s -X POST "$API/internal/cron/scheduled-orders" -H "x-cron-secret: $CRON_SECRET" & done; wait
  ```
- **Résultat attendu** : au total **`placed: 1`** sur les trois réponses (les autres renvoient `placed: 0`) ;
  **une seule commande** créée, statut `CONFIRMED`, solde débité **une fois**, stock déduit **une fois**, ligne
  `ScheduledOrder` en `PLACED` avec `orderId`.
  ```sql
  SELECT status, "orderId", "failureReason" FROM "ScheduledOrder" WHERE id = '<id>';
  SELECT count(*) FROM "Order" WHERE "studentId" = '<A>' AND "createdAt" > now() - interval '5 minutes';   -- 1
  ```
- **Variantes** : cantine `BUSY` à l'heure prévue → `PLACED` ; cantine `CLOSED` → `FAILED` avec motif et
  notification, rien débité ; solde insuffisant → `FAILED` ; **annulation (`POST /scheduled-orders/<id>/cancel`)
  simultanée à l'exécution** → un seul gagnant.
- **Échec si** : deux commandes, ou une commande `PLACED` sans commande, ou un débit sans commande.

## 6. Signalement des commandes non récupérées

- **Préparation** : une commande `READY` ; la faire « vieillir » :
  ```sql
  UPDATE "Order" SET "readyAt" = now() - interval '61 minutes' WHERE id = '<commande>';
  ```
- **Action** : `curl -s -X POST "$API/internal/cron/unclaimed-orders" -H "x-cron-secret: $CRON_SECRET"` deux fois.
- **Résultat attendu** : première réponse `{"ok":true,"flagged":1}` (au moins la commande préparée), seconde
  `flagged` sans cette commande ; `unclaimedAt` renseigné et **inchangé** au second passage ; statut toujours
  `READY` ; aucune notification, aucun mouvement d'argent.
  ```sql
  SELECT status, "unclaimedAt", "readyAt" FROM "Order" WHERE id = '<commande>';
  ```
- **Variantes** : commande `READY` depuis 59 minutes → non signalée ; commande passée ensuite à `RECEIVED` →
  `unclaimedAt` conservé ; avec `UNCLAIMED_ORDER_DELAY_MINUTES=30` (Vercel, redéploiement) → seuil à 30 minutes ;
  valeur invalide (`abc`, `0`) → retombe sur 60.

## 7. Rappel de programmation : durée avec beaucoup d'étudiants

Objectif : confirmer que le passage de **2 000 rappels** tient dans les **30 secondes** de la fonction Vercel
(`maxDuration` dans `vercel.json`).

- **Préparation** : insérer 2 500 étudiants actifs jamais rappelés (base d'essai uniquement) :
  ```sql
  INSERT INTO "User" (id, phone, role, "referralCode", "walletBalance", "updatedAt")
  SELECT gen_random_uuid()::text, '+2289' || lpad(g::text, 7, '0'), 'STUDENT',
         upper(substr(md5(random()::text), 1, 8)), 0, now()
  FROM generate_series(1, 2500) g;
  ```
  (adapter la liste des colonnes obligatoires si le schéma a évolué ; `referralCode` doit rester unique).
- **Action** : `time curl -s -X POST "$API/internal/cron/scheduling-reminders" -H "x-cron-secret: $CRON_SECRET"`.
- **Résultat attendu** : réponse `{"ok":true,"sent":N}` avec `N` ≤ 2 000, en **moins de 25 secondes** (marge de
  sécurité sur 30). Un second appel envoie le reste, puis `sent: 0`. Aucun étudiant ne reçoit deux rappels.
  ```sql
  SELECT count(*) FROM "User" WHERE "lastSchedulingReminderAt" IS NOT NULL;
  SELECT "userId", count(*) FROM "Notification" WHERE title = 'Programme ton repas' GROUP BY 1 HAVING count(*) > 1;   -- 0 ligne
  ```
- **Si la réponse dépasse 25 secondes ou si Vercel coupe la fonction** : un passage interrompu garde ce qu'il a
  fait (la date est écrite étudiant par étudiant) et le reste est repris au passage suivant. Dans ce cas,
  **réduire `SCHEDULING_REMINDER_PASS_LIMIT`** (`src/modules/notifications/scheduling-reminders.constants.ts`) et
  noter la capacité réelle : 3 jours d'intervalle × plafond par jour = nombre maximal d'étudiants servis.
- **Variante** : lancer le workflow `scheduling-reminders` à la main (`workflow_dispatch`) pendant l'essai : pas
  de plantage ; des doublons de notification sont possibles si deux passages se chevauchent (cas connu).

## 8. Récompense de parrainage : une seule fois ; webhook FedaPay rejoué

- **Préparation** : `P` (parrain) : noter `referralCode` (`GET /users/me`) et le solde. Inscrire `F` (filleul) avec
  `"referralCode": "<code de P en minuscules, avec espaces>"` à `POST /auth/verify-otp` (le lien est créé) ; un code
  inconnu doit donner `400 Code de parrainage invalide ou inexistant`.
- **Action 1** : première recharge réussie de `F` (FedaPay, mode test). **Attendu** : solde de `P` **+100**,
  transaction `REFERRAL_BONUS`, notification « Bonus de parrainage », `Referral.rewardedAt` et `rewardTickets = 100`.
  ```sql
  SELECT "referrerId", "rewardTickets", "rewardedAt" FROM "Referral" WHERE "refereeId" = '<F>';
  SELECT count(*) FROM "Transaction" WHERE "userId" = '<P>' AND type = 'REFERRAL_BONUS';   -- 1
  SELECT "walletBalance" FROM "User" WHERE id IN ('<P>','<F>');
  ```
- **Action 2 (webhook rejoué)** : rejouer **le même webhook** (depuis le tableau de bord FedaPay, « renvoyer
  l'événement », ou `curl` avec le même corps et la même signature) **plusieurs fois, y compris simultanément**.
  **Attendu** : réponses `200` ; aucune seconde récompense ; **une seule** recharge créditée à `F`
  (`PaymentWebhookEvent.providerEventKey` unique).
- **Action 3** : deuxième recharge réussie de `F`. **Attendu** : aucune récompense supplémentaire.
- **Variantes** : recharge **échouée** de `F` → aucune récompense ; recharge d'un utilisateur **sans parrain** →
  aucun effet ; deux recharges de `F` **simultanées** (premières) → récompense versée **une seule fois**.
- **Échec si** : deux transactions `REFERRAL_BONUS` pour un même filleul, ou un parrain crédité sans recharge.

## 9. Ajustement de stock négatif et alerte de stock faible

- **Préparation** : `Sauce` à `quantity = 8`, `lowStockThreshold = 5`.
- **Action 1** : `PATCH /components/<id>/stock` `{"delta":-4}` (jeton `V`). **Attendu** : `200 { id, quantity: 4 }` et
  **une** notification « Stock faible » pour la vendeuse (`Sauce : il ne reste que 4 en stock.`).
- **Action 2** : `{"delta":-1}` (4 vers 3). **Attendu** : aucune nouvelle alerte (déjà sous le seuil).
- **Action 3** : `{"delta":-3}` à partir de 8 (reste 5, égal au seuil). **Attendu** : aucune alerte ; puis `{"delta":-1}`
  (5 vers 4) : une alerte.
- **Action 4 (simultanéité)** : deux retraits simultanés qui, ensemble, dépassent le stock. **Attendu** : un `200`
  et un `409` ; la quantité ne devient jamais négative.
  ```sql
  SELECT quantity FROM "Component" WHERE id = '<sauce>';
  SELECT title, message, "createdAt" FROM "Notification" WHERE "userId" = '<vendeuse>' AND title = 'Stock faible' ORDER BY "createdAt";
  ```
- **Variantes** : la même alerte lors d'une **commande** qui fait passer le composant sous le seuil ; composant sans
  seuil → jamais d'alerte ; annulation de la commande (restitution) → aucune alerte.

## 10. Remplacement atomique des lignes d'un menu

- **Préparation** : `Menu Poulet` avec 2 lignes (Riz, Poulet).
- **Action 1 (lecture pendant l'écriture)** : en boucle, `GET /menus/<vendorId>` toutes les 50 ms dans un terminal ;
  dans un autre, `PATCH /menus/<id>` avec de nouvelles lignes, 20 fois en alternant deux compositions.
  **Attendu** : la boucle de lecture ne voit **jamais** un menu sans ligne ni une composition mélangée (anciennes
  et nouvelles lignes ensemble).
- **Action 2 (échec)** : `PATCH /menus/<id>` avec une ligne dont le `componentId` est inconnu ou d'une autre
  cantine. **Attendu** : refus `4xx` et **composition d'origine intacte**.
  ```sql
  SELECT count(*) FROM "MenuLine" WHERE "menuId" = '<id>';   -- jamais 0 pendant les essais ; égal à l'ancienne composition après l'échec
  ```
- **Échec si** : un menu apparaît vide ou partiel, ou la composition est perdue après un refus.

## 11. Rupture enregistrée

- **Action 1** : une commande qui amène un composant de `n` à `0`. **Attendu** : `quantity = 0` (la colonne
  `isAvailable` n'est pas modifiée : c'est le réglage de la vendeuse), le composant apparaît avec `available: false`
  dans `GET /components/<vendorId>` (sans `quantity`) et **une** ligne `ComponentRupture` est créée.
- **Action 2** : un retrait de stock (`PATCH …/stock`) qui amène un composant à `0`. **Attendu** : même résultat.
- **Action 3** : deux commandes simultanées qui consomment ensemble le dernier stock : **une seule** rupture
  enregistrée pour ce passage à zéro.
  ```sql
  SELECT "componentId", "vendorId", "occurredAt" FROM "ComponentRupture" WHERE "componentId" = '<id>' ORDER BY "occurredAt";
  ```
- **Échec si** : aucune ligne alors que le stock est à 0, ou plusieurs lignes pour un même passage à zéro.

## 12. Index unique partiel des signalements

- **Préparation** : une commande `READY` de `A`.
- **Action 1** : deux `POST /reports` simultanés pour cette commande (même jeton). **Attendu** : un `201` et un `409`
  « `Un signalement est déjà en cours de traitement pour cette commande` ».
- **Action 2 (filet de la base)** : tenter d'insérer directement un second signalement non traité :
  ```sql
  INSERT INTO "Report" (id, "orderId", "studentId", "vendorId", type, status)
  SELECT gen_random_uuid()::text, "orderId", "studentId", "vendorId", type, 'OPEN' FROM "Report" WHERE "orderId" = '<commande>' LIMIT 1;
  ```
  **Attendu** : erreur `duplicate key value violates unique constraint "Report_orderId_open_key"`.
- **Action 3** : passer le signalement à `RESOLVED` (web, `PATCH /reports/<id>` `{"status":"RESOLVED"}`) puis en créer un
  nouveau pour la même commande. **Attendu** : `201`.
- **Vérification de l'index** :
  ```sql
  SELECT indexdef FROM pg_indexes WHERE indexname = 'Report_orderId_open_key';   -- doit contenir WHERE (status <> 'RESOLVED'::"ReportStatus")
  ```
- **Échec si** : l'index est absent (la migration n'a pas reçu l'instruction finale de `docs/MIGRATION.md`), ou deux signalements non
  traités coexistent pour une commande.

## 13. Ventes par période (`date_trunc`)

- **Préparation** : sur la cantine d'essai, des commandes créditées (`readyAt`) et annulées (`cancelledAt`) réparties
  sur plusieurs jours, **dont des dates proches de minuit UTC, de la frontière dimanche/lundi et de la fin de mois**
  (modifier `readyAt` par `UPDATE` sur la base d'essai).
- **Action** : `GET /vendors/me/sales?from=<début>&to=<fin>&groupBy=day`, puis `week`, puis `month` (jeton `V`).
- **Résultat attendu** : chaque période de l'intervalle est présente (même à zéro) ; `periodStart` en UTC ; semaines du
  **lundi** au dimanche ; les totaux de `summary` égalent la somme des périodes ; `creditedOrders` et
  `collectedTickets` suivent `readyAt`, `cancelledOrders` et `refundedTickets` suivent `cancelledAt`.
- **Comparaison à la base** (jour) :
  ```sql
  SELECT date_trunc('day', "readyAt") AS jour, count(*) AS commandes, coalesce(sum("totalTickets"), 0) AS tickets
  FROM "Order" WHERE "vendorId" = '<id>' AND "readyAt" >= '<from>' AND "readyAt" <= '<to>' GROUP BY 1 ORDER BY 1;
  ```
  Les chiffres de la requête doivent correspondre à ceux de l'API pour chaque période.
- **Cas d'erreur** : `from` après `to` → `400` ; intervalle de plus de 366 jours → `400` ; `groupBy=year` → `400`.
- **Échec si** : une commande près de minuit est comptée dans la mauvaise période (fuseau de session de la base).

## 14. Indicateurs d'administration

- **Action** (jeton web administrateur, puis supervision) : `GET /admin/analytics/orders-summary` (avec une période) et
  `GET /admin/analytics/stock`.
- **Résultat attendu** : accessibles à l'administrateur **et** à la supervision ; totaux de la période et détail
  **jour par jour** (tous les jours présents) ; composants les plus vendus, ruptures fréquentes, périodes de
  forte demande cohérents avec les données ; temps de réponse raisonnable (moins de 2 secondes sur le jeu d'essai).
- **Comparaison à la base** : recompter à la main le nombre de commandes par statut et par jour, les quantités vendues
  par composant et le nombre de lignes `ComponentRupture` de la période, et les comparer aux réponses.
- **Échec si** : un jour manque dans le détail, un total diffère de la base, ou la supervision est refusée.

---

## Tableau de suivi (à remplir)

| N° | Essai | Résultat attendu respecté (oui/non) | Date | Observations |
|---|---|---|---|---|
| 1 | Déduction atomique du stock | | | |
| 2 | Numérotation | | | |
| 3 | Crédit vendeuse à `READY` | | | |
| 4 | Annulation, stock, remboursement | | | |
| 5 | Commande programmée simultanée | | | |
| 6 | Commandes non récupérées | | | |
| 7 | Rappel de programmation (durée) | | | |
| 8 | Parrainage et webhook rejoué | | | |
| 9 | Stock négatif et alerte | | | |
| 10 | Lignes de menu atomiques | | | |
| 11 | Rupture enregistrée | | | |
| 12 | Index partiel des signalements | | | |
| 13 | Ventes par période | | | |
| 14 | Indicateurs d'administration | | | |

**Critère de passage** : les 14 essais respectent le résultat attendu. Tout échec sur un essai de concurrence (1 à 5, 8, 12)
bloque la mise en service : le noter, corriger, et relancer l'essai concerné au moins 20 fois.
