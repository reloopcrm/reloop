UPDATE "calendarAttendee"
SET "isSelf" = true
WHERE "isSelf" = false
  AND lower("email") IN (
    SELECT lower(u."email")
    FROM "user" u
    WHERE EXISTS (
      SELECT 1 FROM "mailboxSync" c
      WHERE c."userId" = u."id" AND c."source" = 'calendar'
    )
    UNION
    SELECT lower(m."address")
    FROM "mailboxSync" m
    WHERE m."address" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "mailboxSync" c
        WHERE c."userId" = m."userId" AND c."source" = 'calendar'
      )
  );
