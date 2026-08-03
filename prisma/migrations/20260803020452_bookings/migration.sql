-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "booking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "packageId" TEXT,
    "packageName" TEXT NOT NULL,
    "pricingModel" "PricingModel" NOT NULL,
    "priceCents" INTEGER,
    "durationMinutes" INTEGER NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_reference_key" ON "booking"("reference");

-- CreateIndex
CREATE INDEX "booking_businessId_startAt_idx" ON "booking"("businessId", "startAt");

-- CreateIndex
CREATE INDEX "booking_customerEmail_idx" ON "booking"("customerEmail");

-- CreateIndex
CREATE INDEX "booking_status_idx" ON "booking"("status");

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "service_package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Double-booking prevention.
--
-- A check-then-insert in application code cannot be correct: two requests can
-- both read an empty slot before either writes. The database is the only
-- place with a serialization point, so the guarantee lives here.
--
-- btree_gist lets a GiST index mix the equality column ("businessId") with the
-- range column, which a plain GiST index cannot do.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "booking"
  ADD CONSTRAINT "booking_no_overlap"
  EXCLUDE USING gist (
    "businessId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  -- Declined and cancelled bookings free their time back up; completed work
  -- is history and must not block a rebooking of the same slot either.
  WHERE (status IN ('PENDING', 'CONFIRMED'));
