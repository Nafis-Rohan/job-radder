-- CreateEnum
CREATE TYPE "RemoteEligibility" AS ENUM ('ELIGIBLE', 'NOT_ELIGIBLE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "deadline" TIMESTAMP(3),
    "experienceText" TEXT,
    "skills" TEXT[],
    "level" "Level" NOT NULL DEFAULT 'UNKNOWN',
    "domains" TEXT[],
    "postedAt" TIMESTAMP(3),
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "remoteScope" TEXT,
    "eligibility" "RemoteEligibility",

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_url_key" ON "Job"("url");

-- CreateIndex
CREATE UNIQUE INDEX "Job_hash_key" ON "Job"("hash");

-- CreateIndex
CREATE INDEX "Job_foundAt_idx" ON "Job"("foundAt");

-- CreateIndex
CREATE INDEX "Job_company_idx" ON "Job"("company");

-- CreateIndex
CREATE INDEX "Job_isRemote_eligibility_idx" ON "Job"("isRemote", "eligibility");
