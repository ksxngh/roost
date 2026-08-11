-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('APPROVE', 'REJECT', 'SUSPEND', 'REINSTATE');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "business_review" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "action" "ModerationAction" NOT NULL,
    "fromStatus" "BusinessStatus" NOT NULL,
    "toStatus" "BusinessStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_review_businessId_createdAt_idx" ON "business_review"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "business_review" ADD CONSTRAINT "business_review_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_review" ADD CONSTRAINT "business_review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

