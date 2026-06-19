/*
  Warnings:

  - You are about to drop the column `adminId` on the `Room` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Room" DROP CONSTRAINT "Room_adminId_fkey";

-- AlterTable
ALTER TABLE "Room" DROP COLUMN "adminId";

-- CreateTable
CREATE TABLE "_RoomMembers" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RoomMembers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_RoomAdmin" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RoomAdmin_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_RoomMembers_B_index" ON "_RoomMembers"("B");

-- CreateIndex
CREATE INDEX "_RoomAdmin_B_index" ON "_RoomAdmin"("B");

-- AddForeignKey
ALTER TABLE "_RoomMembers" ADD CONSTRAINT "_RoomMembers_A_fkey" FOREIGN KEY ("A") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoomMembers" ADD CONSTRAINT "_RoomMembers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoomAdmin" ADD CONSTRAINT "_RoomAdmin_A_fkey" FOREIGN KEY ("A") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoomAdmin" ADD CONSTRAINT "_RoomAdmin_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
