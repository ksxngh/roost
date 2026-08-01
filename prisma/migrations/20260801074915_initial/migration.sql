-- CreateEnum
CREATE TYPE "BusinessRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "about" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logoKey" TEXT,
    "status" "BusinessStatus" NOT NULL DEFAULT 'DRAFT',
    "verifiedAt" TIMESTAMP(3),
    "insuredUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_member" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "service_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_category" (
    "businessId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "business_category_pkey" PRIMARY KEY ("businessId","categoryId")
);

-- CreateTable
CREATE TABLE "service_area" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_area_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "business_slug_key" ON "business"("slug");

-- CreateIndex
CREATE INDEX "business_status_idx" ON "business"("status");

-- CreateIndex
CREATE INDEX "business_member_userId_idx" ON "business_member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "business_member_businessId_userId_key" ON "business_member"("businessId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "service_category_slug_key" ON "service_category"("slug");

-- CreateIndex
CREATE INDEX "business_category_categoryId_idx" ON "business_category"("categoryId");

-- CreateIndex
CREATE INDEX "service_area_city_region_country_idx" ON "service_area"("city", "region", "country");

-- CreateIndex
CREATE UNIQUE INDEX "service_area_businessId_city_region_country_key" ON "service_area"("businessId", "city", "region", "country");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_member" ADD CONSTRAINT "business_member_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_member" ADD CONSTRAINT "business_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_category" ADD CONSTRAINT "business_category_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_category" ADD CONSTRAINT "business_category_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "service_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_area" ADD CONSTRAINT "service_area_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
