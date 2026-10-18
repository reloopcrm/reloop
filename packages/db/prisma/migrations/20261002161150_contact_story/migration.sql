CREATE TABLE "contactStory" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "story" JSONB NOT NULL,
    "language" TEXT,
    "modelId" TEXT,
    "basedOnUntil" TIMESTAMP(3),
    "basedOnCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contactStory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contactStory_contactId_key" ON "contactStory"("contactId");

ALTER TABLE "contactStory" ADD CONSTRAINT "contactStory_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
