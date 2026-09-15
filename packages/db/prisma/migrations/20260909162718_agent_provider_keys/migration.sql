-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "agentAnthropicKey" TEXT,
ADD COLUMN     "agentAnthropicModel" TEXT,
ADD COLUMN     "agentOpenaiKey" TEXT,
ADD COLUMN     "agentOpenaiModel" TEXT,
ADD COLUMN     "agentResearchPerHour" INTEGER;
