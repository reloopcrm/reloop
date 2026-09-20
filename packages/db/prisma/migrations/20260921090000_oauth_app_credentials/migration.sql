-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "googleClientId" TEXT,
ADD COLUMN     "googleClientSecret" TEXT,
ADD COLUMN     "microsoftClientId" TEXT,
ADD COLUMN     "microsoftClientSecret" TEXT,
ADD COLUMN     "microsoftTenantId" TEXT,
ADD COLUMN     "slackClientId" TEXT,
ADD COLUMN     "slackClientSecret" TEXT;
