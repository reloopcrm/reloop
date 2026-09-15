-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "winBackRulesMode" TEXT,
ADD COLUMN     "winBackRulesNote" TEXT,
ADD COLUMN     "winBackRulesTunedAt" TIMESTAMP(3);
