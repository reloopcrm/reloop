ALTER TABLE "mailboxSync" ADD COLUMN "backfill" TEXT;
ALTER TABLE "mailboxSync" ADD COLUMN "importSince" TIMESTAMP(3);
