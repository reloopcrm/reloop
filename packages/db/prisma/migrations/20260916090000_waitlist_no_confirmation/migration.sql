DROP INDEX "waitlistSignup_tokenHash_key";

ALTER TABLE "waitlistSignup" DROP COLUMN "tokenHash",
DROP COLUMN "confirmedAt";
