-- CreateTable
CREATE TABLE "providerUsage" (
    "provider" TEXT NOT NULL,
    "planType" TEXT,
    "primaryUsedPercent" INTEGER,
    "primaryResetAt" TIMESTAMP(3),
    "primaryWindowMinutes" INTEGER,
    "secondaryUsedPercent" INTEGER,
    "secondaryResetAt" TIMESTAMP(3),
    "secondaryWindowMinutes" INTEGER,
    "fasterModel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providerUsage_pkey" PRIMARY KEY ("provider")
);
