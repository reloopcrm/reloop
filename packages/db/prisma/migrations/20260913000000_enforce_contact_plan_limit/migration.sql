CREATE FUNCTION enforce_contact_plan_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_plan text;
  contact_limit integer;
BEGIN
  UPDATE "appSetting" SET plan = plan WHERE id = 'app' RETURNING plan INTO current_plan;
  contact_limit := CASE current_plan WHEN 'handel' THEN 10000 WHEN 'handel-plus' THEN NULL WHEN '' THEN NULL ELSE 2000 END;
  IF current_plan IS NULL THEN RETURN NEW; END IF;
  IF contact_limit IS NOT NULL AND (SELECT count(*) FROM "contact") > contact_limit THEN
    RAISE EXCEPTION 'The contact limit is reached. Ask the server operator to change your plan.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contact_plan_limit AFTER INSERT ON "contact" FOR EACH ROW EXECUTE FUNCTION enforce_contact_plan_limit();
