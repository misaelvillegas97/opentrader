-- CreateTable
CREATE TABLE "PaperAsset" (
                            "currency" TEXT             NOT NULL,
                            "balance"  DOUBLE PRECISION NOT NULL,

                            CONSTRAINT "PaperAsset_pkey" PRIMARY KEY ("currency")
);

-- CreateTable
CREATE TABLE "PaperOrder" (
                            "id"                 SERIAL           NOT NULL,
    "type" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
                            "quantity"           DOUBLE PRECISION NOT NULL,
                            "price"              DOUBLE PRECISION,
                            "filledPrice"        DOUBLE PRECISION,
                            "lastTradeTimestamp" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'open',
                            "fee"                DOUBLE PRECISION NOT NULL DEFAULT 0,
                            "createdAt"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

                            CONSTRAINT "PaperOrder_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ExchangeAccount"
  ADD COLUMN "isPaperAccount" BOOLEAN NOT NULL DEFAULT false;
