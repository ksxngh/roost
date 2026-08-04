-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "internalNote" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "business_document" ADD COLUMN     "expiryNoticeSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "booking_assignedToId_idx" ON "booking"("assignedToId");

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "business_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

