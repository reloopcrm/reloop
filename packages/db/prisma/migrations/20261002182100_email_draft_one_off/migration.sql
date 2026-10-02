ALTER TABLE "emailDraft" ADD COLUMN     "oneOffAt" TIMESTAMP(3),
ADD COLUMN     "oneOffBody" TEXT,
ADD COLUMN     "oneOffSubject" TEXT;
