-- CreateIndex
CREATE INDEX "emailMessage_realAnswer_missing_idx" ON "emailMessage"("id") WHERE ("realAnswer" IS NULL);
