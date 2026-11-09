-- CreateEnum
CREATE TYPE "MatchLabel" AS ENUM ('STRONG', 'GOOD', 'PARTIAL', 'WEAK');

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "cvId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stackFit" INTEGER,
    "expFit" INTEGER NOT NULL,
    "levelFit" INTEGER NOT NULL,
    "domainFit" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "label" "MatchLabel" NOT NULL,
    "gaps" TEXT[],
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Match_cvId_total_idx" ON "Match"("cvId", "total");

-- CreateIndex
CREATE INDEX "Match_jobId_idx" ON "Match"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_cvId_jobId_key" ON "Match"("cvId", "jobId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_cvId_fkey" FOREIGN KEY ("cvId") REFERENCES "Cv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
