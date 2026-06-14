/*
  Warnings:

  - Added the required column `userId` to the `Shapes` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Shapes" DROP CONSTRAINT "Shapes_roomId_fkey";

-- AlterTable
ALTER TABLE "Shapes" ADD COLUMN     "userId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Shapes" ADD CONSTRAINT "Shapes_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shapes" ADD CONSTRAINT "Shapes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
