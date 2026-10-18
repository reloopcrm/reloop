-- CreateTable
CREATE TABLE "waitlistSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "waitlistSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlistSignup_email_key" ON "waitlistSignup"("email");

-- CreateIndex
CREATE UNIQUE INDEX "waitlistSignup_tokenHash_key" ON "waitlistSignup"("tokenHash");

