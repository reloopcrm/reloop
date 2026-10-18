CREATE TABLE "calendarEventSync" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendarEventSync_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calendarEventSync_eventId_userId_key" ON "calendarEventSync"("eventId", "userId");

CREATE INDEX "calendarEventSync_userId_googleEventId_idx" ON "calendarEventSync"("userId", "googleEventId");

ALTER TABLE "calendarEventSync" ADD CONSTRAINT "calendarEventSync_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendarEventSync" ADD CONSTRAINT "calendarEventSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
