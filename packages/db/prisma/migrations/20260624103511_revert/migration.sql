/*
  Warnings:

  - You are about to drop the column `deletedAt` on the `Shapes` table. All the data in the column will be lost.
  - You are about to drop the column `deletedByUserId` on the `Shapes` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Shapes" DROP CONSTRAINT "Shapes_deletedByUserId_fkey";

-- AlterTable
ALTER TABLE "Shapes" DROP COLUMN "deletedAt",
DROP COLUMN "deletedByUserId";
