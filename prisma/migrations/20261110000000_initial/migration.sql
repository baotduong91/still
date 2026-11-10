-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "owner" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" UUID NOT NULL,
    "owner" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scripture" (
    "id" SERIAL NOT NULL,
    "translation" TEXT NOT NULL,
    "book" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "Scripture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Plan_owner_createdAt_idx" ON "Plan"("owner", "createdAt");

-- CreateIndex
CREATE INDEX "Journal_owner_createdAt_idx" ON "Journal"("owner", "createdAt");

-- CreateIndex
CREATE INDEX "Scripture_translation_book_chapter_idx" ON "Scripture"("translation", "book", "chapter");

-- CreateIndex
CREATE UNIQUE INDEX "Scripture_translation_book_chapter_verse_key" ON "Scripture"("translation", "book", "chapter", "verse");

