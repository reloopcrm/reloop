-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "signInAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[];
