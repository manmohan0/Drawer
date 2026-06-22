/*
  Warnings:

  - Added the required column `role` to the `roomUser` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "roomUser" ADD COLUMN     "role" "role" NOT NULL;
