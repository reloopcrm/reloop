-- AlterTable
ALTER TABLE "emailThread" ADD COLUMN     "classification" TEXT NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "mailboxSync" ADD COLUMN     "createFrom" TEXT;

-- CreateTable
CREATE TABLE "threadInsight" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "relevant" BOOLEAN NOT NULL,
    "topics" TEXT[],
    "side" TEXT,
    "products" TEXT[],
    "quantityPallets" INTEGER,
    "loads" INTEGER,
    "outcome" TEXT NOT NULL,
    "unansweredByUs" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL,
    "evidence" TEXT[],
    "modelId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threadInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactMemory" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "didBusiness" INTEGER NOT NULL DEFAULT 0,
    "openInquiries" INTEGER NOT NULL DEFAULT 0,
    "maxPallets" INTEGER,
    "products" TEXT[],
    "lastOutcome" TEXT,
    "coveredThreadIds" TEXT[],
    "modelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contactMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "potentialFeedback" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "note" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "potentialFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "threadInsight_threadId_key" ON "threadInsight"("threadId");

-- CreateIndex
CREATE INDEX "threadInsight_relevant_idx" ON "threadInsight"("relevant");

-- CreateIndex
CREATE UNIQUE INDEX "contactMemory_contactId_key" ON "contactMemory"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "potentialFeedback_contactId_key" ON "potentialFeedback"("contactId");

-- CreateIndex
CREATE INDEX "emailThread_classification_idx" ON "emailThread"("classification");

-- AddForeignKey
ALTER TABLE "threadInsight" ADD CONSTRAINT "threadInsight_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "emailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactMemory" ADD CONSTRAINT "contactMemory_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "potentialFeedback" ADD CONSTRAINT "potentialFeedback_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
