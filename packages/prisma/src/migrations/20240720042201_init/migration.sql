-- CreateTable
CREATE TABLE "User" (
                      "id"       SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'User',
                      "password" TEXT   NOT NULL,

                      CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeAccount" (
                                 "id"        SERIAL       NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "exchangeCode" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "secretKey" TEXT NOT NULL,
    "password" TEXT,
    "isDemoAccount" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" INTEGER NOT NULL,
                                 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                 "updatedAt" TIMESTAMP(3) NOT NULL,
    "expired" BOOLEAN NOT NULL DEFAULT false,

                                 CONSTRAINT "ExchangeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartTrade" (
                            "id"        SERIAL       NOT NULL,
    "type" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "takeProfitType" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "exchangeSymbolId" TEXT NOT NULL,
    "ref" TEXT,
    "exchangeAccountId" INTEGER NOT NULL,
    "botId" INTEGER,
    "ownerId" INTEGER NOT NULL,
                            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            "updatedAt" TIMESTAMP(3) NOT NULL,

                            CONSTRAINT "SmartTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
                       "id"          SERIAL           NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Idle',
    "type" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "side" TEXT NOT NULL,
                       "price"       DOUBLE PRECISION,
                       "filledPrice" DOUBLE PRECISION,
                       "fee"         DOUBLE PRECISION,
    "exchangeOrderId" TEXT,
                       "quantity"    DOUBLE PRECISION NOT NULL,
    "smartTradeId" INTEGER NOT NULL,
                       "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                       "placedAt"    TIMESTAMP(3),
                       "syncedAt"    TIMESTAMP(3)              DEFAULT CURRENT_TIMESTAMP,
                       "filledAt"    TIMESTAMP(3),
                       "updatedAt"   TIMESTAMP(3)     NOT NULL,

                       CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bot" (
                     "id"        SERIAL       NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "template" TEXT NOT NULL,
    "timeframe" TEXT,
    "processing" BOOLEAN NOT NULL DEFAULT false,
                     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settings" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT '{}',
    "exchangeAccountId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,

                     CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Markets" (
                         "exchangeCode" TEXT         NOT NULL,
    "markets" TEXT NOT NULL,
                         "updatedAt"    TIMESTAMP(3) NOT NULL,

                         CONSTRAINT "Markets_pkey" PRIMARY KEY ("exchangeCode")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeAccount_label_key" ON "ExchangeAccount"("label");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_label_key" ON "Bot"("label");

-- AddForeignKey
ALTER TABLE "ExchangeAccount"
  ADD CONSTRAINT "ExchangeAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartTrade"
  ADD CONSTRAINT "SmartTrade_exchangeAccountId_fkey" FOREIGN KEY ("exchangeAccountId") REFERENCES "ExchangeAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartTrade"
  ADD CONSTRAINT "SmartTrade_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartTrade"
  ADD CONSTRAINT "SmartTrade_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_smartTradeId_fkey" FOREIGN KEY ("smartTradeId") REFERENCES "SmartTrade" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bot"
  ADD CONSTRAINT "Bot_exchangeAccountId_fkey" FOREIGN KEY ("exchangeAccountId") REFERENCES "ExchangeAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bot"
  ADD CONSTRAINT "Bot_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
