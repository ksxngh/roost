-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "quote" ADD COLUMN     "clientId" TEXT;

-- CreateTable
CREATE TABLE "client" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_businessId_name_idx" ON "client"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "client_businessId_email_key" ON "client"("businessId", "email");

-- CreateIndex
CREATE INDEX "booking_clientId_idx" ON "booking"("clientId");

-- CreateIndex
CREATE INDEX "invoice_clientId_idx" ON "invoice"("clientId");

-- CreateIndex
CREATE INDEX "quote_clientId_idx" ON "quote"("clientId");

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill.
--
-- Clients are derived data: every booking, quote, and invoice already carries
-- a customer. Shipping this table empty would make an existing business's
-- client list look like they had never worked for anyone, so the history is
-- reconstructed here rather than accruing only from new documents.
--
-- Identity is (businessId, lower(email)), matching the application's rule.
INSERT INTO "client" (
  "id", "businessId", "email", "name", "phone",
  "addressLine1", "addressLine2", "city", "region", "postalCode",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  s."businessId",
  s."email",
  -- The name and address from the most recent document win, which is what a
  -- provider means by "their details".
  (array_agg(s."name"         ORDER BY s."createdAt" DESC))[1],
  (array_agg(s."phone"        ORDER BY s."createdAt" DESC))[1],
  (array_agg(s."addressLine1" ORDER BY s."createdAt" DESC))[1],
  (array_agg(s."addressLine2" ORDER BY s."createdAt" DESC))[1],
  (array_agg(s."city"         ORDER BY s."createdAt" DESC))[1],
  (array_agg(s."region"       ORDER BY s."createdAt" DESC))[1],
  (array_agg(s."postalCode"   ORDER BY s."createdAt" DESC))[1],
  MIN(s."createdAt"),
  now()
FROM (
  SELECT "businessId", lower("customerEmail") AS "email", "customerName" AS "name",
         "customerPhone" AS "phone", "addressLine1", "addressLine2", "city",
         "region", "postalCode", "createdAt"
    FROM "booking"
  UNION ALL
  SELECT "businessId", lower("customerEmail"), "customerName",
         "customerPhone", "addressLine1", "addressLine2", "city",
         "region", "postalCode", "createdAt"
    FROM "quote"
  UNION ALL
  SELECT "businessId", lower("customerEmail"), "customerName",
         "customerPhone", "addressLine1", "addressLine2", "city",
         "region", "postalCode", "createdAt"
    FROM "invoice"
) AS s
WHERE s."email" <> ''
GROUP BY s."businessId", s."email";

-- Point the existing documents at the clients just created.
UPDATE "booking" b SET "clientId" = c."id"
  FROM "client" c
 WHERE c."businessId" = b."businessId"
   AND c."email" = lower(b."customerEmail");

UPDATE "quote" q SET "clientId" = c."id"
  FROM "client" c
 WHERE c."businessId" = q."businessId"
   AND c."email" = lower(q."customerEmail");

UPDATE "invoice" i SET "clientId" = c."id"
  FROM "client" c
 WHERE c."businessId" = i."businessId"
   AND c."email" = lower(i."customerEmail");
