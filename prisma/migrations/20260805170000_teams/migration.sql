-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('PRO', 'PREMIUM');

-- CreateEnum
CREATE TYPE "MemberCapability" AS ENUM ('SCHEDULE', 'BILLING', 'CLIENTS', 'STOREFRONT');

-- AlterTable
ALTER TABLE "business" ADD COLUMN     "plan" "PlanTier" NOT NULL DEFAULT 'PREMIUM';

-- AlterTable
ALTER TABLE "business_member" ADD COLUMN     "capabilities" "MemberCapability"[] DEFAULT ARRAY[]::"MemberCapability"[];

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL DEFAULT 'MEMBER',
    "capabilities" "MemberCapability"[] DEFAULT ARRAY[]::"MemberCapability"[],
    "token" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_token_key" ON "invitation"("token");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_businessId_email_key" ON "invitation"("businessId", "email");

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "business_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

