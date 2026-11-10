-- CreateTable
CREATE TABLE "FavoriteCompany" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "careersUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteCompany_userId_name_key" ON "FavoriteCompany"("userId", "name");

-- AddForeignKey
ALTER TABLE "FavoriteCompany" ADD CONSTRAINT "FavoriteCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
