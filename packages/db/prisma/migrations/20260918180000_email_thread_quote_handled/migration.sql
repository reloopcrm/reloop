-- AlterTable
ALTER TABLE "emailThread" ADD COLUMN "quoteHandledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "emailThread_quoteHandledAt_idx" ON "emailThread"("quoteHandledAt");
