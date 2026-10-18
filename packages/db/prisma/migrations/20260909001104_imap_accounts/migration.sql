-- AlterTable
ALTER TABLE "emailMessage" ADD COLUMN     "imapAccountId" TEXT;

-- CreateTable
CREATE TABLE "imapAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 993,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "importSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imapAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imapAccount_userId_idx" ON "imapAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "imapAccount_userId_email_key" ON "imapAccount"("userId", "email");

-- CreateIndex
CREATE INDEX "emailMessage_imapAccountId_idx" ON "emailMessage"("imapAccountId");

-- AddForeignKey
ALTER TABLE "imapAccount" ADD CONSTRAINT "imapAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
