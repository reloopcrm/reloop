-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "playbookLearnedAt" TIMESTAMP(3),
ADD COLUMN     "playbookOutboundCount" INTEGER,
ADD COLUMN     "workspacePlaybook" JSONB;

-- AlterTable
ALTER TABLE "contact" ADD COLUMN     "cleanedAt" TIMESTAMP(3);
