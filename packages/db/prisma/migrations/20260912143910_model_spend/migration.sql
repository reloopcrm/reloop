-- CreateTable
CREATE TABLE "modelSpend" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "model" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "priced" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelSpend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modelSpend_day_idx" ON "modelSpend"("day");

-- CreateIndex
CREATE UNIQUE INDEX "modelSpend_day_model_kind_key" ON "modelSpend"("day", "model", "kind");
