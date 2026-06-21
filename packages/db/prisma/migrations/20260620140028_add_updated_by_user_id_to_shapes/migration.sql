/*
  Warnings:

  - You are about to drop the column `userId` on the `Shapes` table. All the data in the column will be lost.
  - Added the required column `createdByUserId` to the `Shapes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedByUserId` to the `Shapes` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Shapes" DROP CONSTRAINT "Shapes_userId_fkey";

-- AlterTable
ALTER TABLE "Shapes" DROP COLUMN "userId",
ADD COLUMN     "createdByUserId" TEXT NOT NULL,
ADD COLUMN     "updatedByUserId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Shapes" ADD CONSTRAINT "Shapes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shapes" ADD CONSTRAINT "Shapes_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
