/*
  Warnings:

  - Changed the type of `slug` on the `Room` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "public"."Shapes" DROP CONSTRAINT "Shapes_roomId_fkey";

-- AlterTable
ALTER TABLE "Room" DROP COLUMN "slug",
ADD COLUMN     "slug" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Room_slug_key" ON "Room"("slug");

-- AddForeignKey
ALTER TABLE "Shapes" ADD CONSTRAINT "Shapes_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
