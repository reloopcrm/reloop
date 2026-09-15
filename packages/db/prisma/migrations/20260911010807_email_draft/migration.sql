-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "agentDraftModel" TEXT;

-- CreateTable
CREATE TABLE "emailDraft" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "language" TEXT,
    "modelId" TEXT,
    "basedOnUntil" TIMESTAMP(3),
    "basedOnCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emailDraft_contactId_key" ON "emailDraft"("contactId");

-- AddForeignKey
ALTER TABLE "emailDraft" ADD CONSTRAINT "emailDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
