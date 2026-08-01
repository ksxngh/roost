-- CreateEnum
CREATE TYPE "BusinessDocumentKind" AS ENUM ('LICENCE', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "business_document" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "BusinessDocumentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_document_storageKey_key" ON "business_document"("storageKey");

-- CreateIndex
CREATE INDEX "business_document_businessId_kind_idx" ON "business_document"("businessId", "kind");

-- CreateIndex
CREATE INDEX "business_document_status_idx" ON "business_document"("status");

-- AddForeignKey
ALTER TABLE "business_document" ADD CONSTRAINT "business_document_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
