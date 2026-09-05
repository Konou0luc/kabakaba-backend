-- Corrige withdrawals.service.ts::updateStatus(FAILED) : le montant recrédité
-- au vendeur était reconstruit par déduction à partir des paliers de frais
-- (fragile si le barème change). On stocke désormais le montant réellement
-- décrémenté à la création du retrait.

-- 1. Colonne ajoutée nullable pour pouvoir backfiller l'existant.
ALTER TABLE "Withdrawal" ADD COLUMN "debitedAmount" DECIMAL(10,2);

-- 2. Backfill des retraits déjà en base avec l'ancienne heuristique de
--    withdrawals.service.ts, pour que l'historique reste cohérent avec ce
--    qui a réellement été débité à l'époque (palier <10k : amount + operatorFee ;
--    palier >=30k, identifiable par platformFee > 0 : amount ; sinon : amount).
UPDATE "Withdrawal"
SET "debitedAmount" = CASE
  WHEN "platformFee" > 0 THEN "amount"
  WHEN "amount" < 10000 THEN "amount" + "operatorFee"
  ELSE "amount"
END
WHERE "debitedAmount" IS NULL;

-- 3. Toute nouvelle ligne doit désormais fournir explicitement ce montant.
ALTER TABLE "Withdrawal" ALTER COLUMN "debitedAmount" SET NOT NULL;
