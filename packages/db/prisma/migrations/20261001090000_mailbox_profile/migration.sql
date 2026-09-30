CREATE TYPE "ArchiveActor" AS ENUM ('SWEEP', 'PERSON');

ALTER TABLE "contact" ADD COLUMN "archivedBy" "ArchiveActor",
ADD COLUMN "confirmedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "mobilePhone" TEXT;

ALTER TABLE "appSetting" ADD COLUMN "mailboxProfile" JSONB,
ADD COLUMN "ownAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "mailboxSync" ADD COLUMN "address" TEXT;

ALTER TABLE "threadInsight" ADD COLUMN "amount" DECIMAL(14,2),
ADD COLUMN "counterpartEmail" TEXT,
ADD COLUMN "currency" TEXT;

CREATE OR REPLACE FUNCTION enforce_contact_plan_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_plan text;
  contact_limit integer;
BEGIN
  UPDATE "appSetting" SET plan = plan WHERE id = 'app' RETURNING plan INTO current_plan;
  contact_limit := CASE current_plan
    WHEN 'trial' THEN 2000
    WHEN 'start' THEN 10000
    WHEN 'standard' THEN 25000
    WHEN 'plus' THEN 50000
    WHEN 'team' THEN 150000
    WHEN 'office' THEN 500000
    WHEN 'hosting' THEN 10000
    WHEN 'hosting-pro' THEN 50000
    WHEN '' THEN NULL
    ELSE 2000 END;
  IF current_plan IS NULL THEN RETURN NEW; END IF;
  IF contact_limit IS NOT NULL AND (SELECT count(*) FROM "contact" WHERE "archivedAt" IS NULL) > contact_limit THEN
    RAISE EXCEPTION 'The contact limit is reached. Ask the server operator to change your plan.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
