-- CreateTable
CREATE TABLE "FavoriteAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FavoriteAlert_jobId_idx" ON "FavoriteAlert"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteAlert_userId_jobId_key" ON "FavoriteAlert"("userId", "jobId");

-- AddForeignKey
ALTER TABLE "FavoriteAlert" ADD CONSTRAINT "FavoriteAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteAlert" ADD CONSTRAINT "FavoriteAlert_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
