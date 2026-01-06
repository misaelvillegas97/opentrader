-- CreateTable
CREATE TABLE "BotLog" (
                        "id"        SERIAL       NOT NULL,
    "action" TEXT NOT NULL,
    "triggerEventType" TEXT,
    "context" TEXT,
    "error" TEXT,
                        "startedAt" TIMESTAMP(3) NOT NULL,
                        "endedAt"   TIMESTAMP(3) NOT NULL,
                        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "botId" INTEGER NOT NULL,

                        CONSTRAINT "BotLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BotLog"
  ADD CONSTRAINT "BotLog_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
