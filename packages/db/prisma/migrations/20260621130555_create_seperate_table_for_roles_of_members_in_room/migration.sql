/*
  Warnings:

  - You are about to drop the `_RoomAdmin` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_RoomMembers` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "role" AS ENUM ('Viewer', 'Editor', 'Owner');

-- DropForeignKey
ALTER TABLE "public"."_RoomAdmin" DROP CONSTRAINT "_RoomAdmin_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_RoomAdmin" DROP CONSTRAINT "_RoomAdmin_B_fkey";

-- DropForeignKey
ALTER TABLE "public"."_RoomMembers" DROP CONSTRAINT "_RoomMembers_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_RoomMembers" DROP CONSTRAINT "_RoomMembers_B_fkey";

-- DropTable
DROP TABLE "public"."_RoomAdmin";

-- DropTable
DROP TABLE "public"."_RoomMembers";

-- CreateTable
CREATE TABLE "roomUser" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roomUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roomUser_roomId_userId_key" ON "roomUser"("roomId", "userId");

-- AddForeignKey
ALTER TABLE "roomUser" ADD CONSTRAINT "roomUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roomUser" ADD CONSTRAINT "roomUser_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
