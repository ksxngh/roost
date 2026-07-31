-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('PDF', 'DOCX', 'PPTX', 'TEXT', 'MARKDOWN', 'IMAGE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "class" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'chart-1',
    "userId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classId" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "pageCount" INTEGER,
    "wordCount" INTEGER,
    "processingError" TEXT,
    "processedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "classId" TEXT,
    "folderId" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_page" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "document_page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'chart-2',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_tag" (
    "documentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "document_tag_pkey" PRIMARY KEY ("documentId","tagId")
);

-- CreateIndex
CREATE INDEX "class_userId_archivedAt_idx" ON "class"("userId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "class_userId_name_key" ON "class"("userId", "name");

-- CreateIndex
CREATE INDEX "folder_userId_idx" ON "folder"("userId");

-- CreateIndex
CREATE INDEX "folder_classId_idx" ON "folder"("classId");

-- CreateIndex
CREATE INDEX "folder_parentId_idx" ON "folder"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "document_storageKey_key" ON "document"("storageKey");

-- CreateIndex
CREATE INDEX "document_userId_deletedAt_archivedAt_idx" ON "document"("userId", "deletedAt", "archivedAt");

-- CreateIndex
CREATE INDEX "document_userId_status_idx" ON "document"("userId", "status");

-- CreateIndex
CREATE INDEX "document_folderId_idx" ON "document"("folderId");

-- CreateIndex
CREATE INDEX "document_classId_idx" ON "document"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "document_userId_checksum_key" ON "document"("userId", "checksum");

-- CreateIndex
CREATE INDEX "document_page_documentId_idx" ON "document_page"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "document_page_documentId_pageNumber_key" ON "document_page"("documentId", "pageNumber");

-- CreateIndex
CREATE INDEX "tag_userId_idx" ON "tag"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tag_userId_name_key" ON "tag"("userId", "name");

-- CreateIndex
CREATE INDEX "document_tag_tagId_idx" ON "document_tag"("tagId");

-- AddForeignKey
ALTER TABLE "class" ADD CONSTRAINT "class_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder" ADD CONSTRAINT "folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder" ADD CONSTRAINT "folder_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder" ADD CONSTRAINT "folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_page" ADD CONSTRAINT "document_page_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag" ADD CONSTRAINT "tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_tag" ADD CONSTRAINT "document_tag_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_tag" ADD CONSTRAINT "document_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
