-- AlterTable
ALTER TABLE "threadInsight" ADD COLUMN     "evidenceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
