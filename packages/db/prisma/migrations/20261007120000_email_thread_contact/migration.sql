-- CreateTable
CREATE TABLE "emailThreadContact" (
    "threadId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emailThreadContact_pkey" PRIMARY KEY ("threadId","contactId")
);

-- CreateIndex
CREATE INDEX "emailThreadContact_contactId_lastAt_idx" ON "emailThreadContact"("contactId", "lastAt");

-- CreateIndex
CREATE INDEX "emailMessage_fromEmail_idx" ON "emailMessage"("fromEmail");

-- CreateIndex
CREATE INDEX "emailMessage_recipients_idx" ON "emailMessage" USING GIN ("recipients" jsonb_path_ops);

-- AddForeignKey
ALTER TABLE "emailThreadContact" ADD CONSTRAINT "emailThreadContact_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "emailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailThreadContact" ADD CONSTRAINT "emailThreadContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

