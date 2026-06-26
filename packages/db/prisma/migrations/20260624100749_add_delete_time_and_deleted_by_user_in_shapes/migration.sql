-- AlterTable
ALTER TABLE "Shapes" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Shapes" ADD CONSTRAINT "Shapes_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
