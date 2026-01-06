/*
  Warnings:

  - You are about to drop the column `baseCurrency` on the `Bot` table. All the data in the column will be lost.
  - You are about to drop the column `quoteCurrency` on the `Bot` table. All the data in the column will be lost.
  - You are about to drop the column `baseCurrency` on the `SmartTrade` table. All the data in the column will be lost.
  - You are about to drop the column `exchangeSymbolId` on the `SmartTrade` table. All the data in the column will be lost.
  - You are about to drop the column `quoteCurrency` on the `SmartTrade` table. All the data in the column will be lost.
  - Added the required column `symbol` to the `Bot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `symbol` to the `SmartTrade` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable Bot: Add symbol column
ALTER TABLE "Bot"
  ADD COLUMN "symbol" TEXT;

-- Migrate data: Construct symbol from baseCurrency and quoteCurrency
UPDATE "Bot"
SET "symbol" = "baseCurrency" || '/' || "quoteCurrency";

-- Make symbol NOT NULL after data migration
ALTER TABLE "Bot"
  ALTER COLUMN "symbol" SET NOT NULL;

-- Drop old columns from Bot
ALTER TABLE "Bot"
  DROP COLUMN "baseCurrency";
ALTER TABLE "Bot"
  DROP COLUMN "quoteCurrency";

-- AlterTable SmartTrade: Add symbol column
ALTER TABLE "SmartTrade"
  ADD COLUMN "symbol" TEXT;

-- Migrate data: Construct symbol from baseCurrency and quoteCurrency
UPDATE "SmartTrade"
SET "symbol" = "baseCurrency" || '/' || "quoteCurrency";

-- Make symbol NOT NULL after data migration
ALTER TABLE "SmartTrade"
  ALTER COLUMN "symbol" SET NOT NULL;

-- Drop old columns from SmartTrade
ALTER TABLE "SmartTrade"
  DROP COLUMN "baseCurrency";
ALTER TABLE "SmartTrade"
  DROP COLUMN "quoteCurrency";
ALTER TABLE "SmartTrade"
  DROP COLUMN "exchangeSymbolId";
