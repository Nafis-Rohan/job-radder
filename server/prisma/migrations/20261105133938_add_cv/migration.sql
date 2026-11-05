-- CreateEnum
CREATE TYPE "Level" AS ENUM ('INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Cv" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "textEnc" TEXT NOT NULL,
    "skills" TEXT[],
    "keywords" TEXT[],
    "yearsExp" DOUBLE PRECISION NOT NULL,
    "level" "Level" NOT NULL,
    "domains" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cv_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cv_userId_idx" ON "Cv"("userId");

-- AddForeignKey
ALTER TABLE "Cv" ADD CONSTRAINT "Cv_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
