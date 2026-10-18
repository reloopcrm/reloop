CREATE OR REPLACE FUNCTION enforce_contact_plan_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  contact_limit integer;
BEGIN
  UPDATE "appSetting" SET "contactLimit" = "contactLimit" WHERE id = 'app' RETURNING "contactLimit" INTO contact_limit;
  IF contact_limit IS NOT NULL AND (SELECT count(*) FROM "contact" WHERE "archivedAt" IS NULL) > contact_limit THEN
    RAISE EXCEPTION 'The contact limit is reached. Ask the server operator to change your plan.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
