-- AlterTable
ALTER TABLE "formSubmission" ADD COLUMN "triedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "formSubmission_visitorId_createdAt_idx" ON "formSubmission"("visitorId", "createdAt");
