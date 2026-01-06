-- AlterTable Order: Add symbol and exchangeAccountId columns
ALTER TABLE "Order"
  ADD COLUMN "symbol" TEXT;
ALTER TABLE "Order"
  ADD COLUMN "exchangeAccountId" INTEGER;

-- Migrate data: Copy symbol and exchangeAccountId from SmartTrade
UPDATE "Order"
SET "symbol"            = s."symbol",
    "exchangeAccountId" = s."exchangeAccountId"
FROM "SmartTrade" s
WHERE "Order"."smartTradeId" = s."id";

-- Make columns NOT NULL after data migration
ALTER TABLE "Order"
  ALTER COLUMN "symbol" SET NOT NULL;
ALTER TABLE "Order"
  ALTER COLUMN "exchangeAccountId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_exchangeAccountId_fkey" FOREIGN KEY ("exchangeAccountId") REFERENCES "ExchangeAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
