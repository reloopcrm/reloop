INSERT INTO "calendarEventSync" ("id", "eventId", "userId", "googleEventId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."id", e."syncedByUserId", e."googleEventId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "calendarEvent" e
JOIN "user" u ON u."id" = e."syncedByUserId"
ON CONFLICT ("eventId", "userId") DO NOTHING;
