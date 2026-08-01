-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FIXED', 'HOURLY', 'QUOTE');

-- AlterTable
ALTER TABLE "business" ADD COLUMN     "bookingHorizonDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "bookingLeadHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Vancouver';

-- CreateTable
CREATE TABLE "service_package" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'FIXED',
    "priceCents" INTEGER,
    "durationMinutes" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_hour" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "business_hour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_exception" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_exception_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_package_businessId_active_idx" ON "service_package"("businessId", "active");

-- CreateIndex
CREATE INDEX "business_hour_businessId_idx" ON "business_hour"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "business_hour_businessId_weekday_startMinute_key" ON "business_hour"("businessId", "weekday", "startMinute");

-- CreateIndex
CREATE UNIQUE INDEX "availability_exception_businessId_date_key" ON "availability_exception"("businessId", "date");

-- AddForeignKey
ALTER TABLE "service_package" ADD CONSTRAINT "service_package_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_package" ADD CONSTRAINT "service_package_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "service_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_hour" ADD CONSTRAINT "business_hour_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exception" ADD CONSTRAINT "availability_exception_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
