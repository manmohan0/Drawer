-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CREATE_SHAPE', 'DELETE_SHAPE', 'MOVE_SHAPE', 'ROTATE_SHAPE', 'SCALE_SHAPE', 'CHANGE_FILL', 'CHANGE_STROKE', 'CHANGE_LAYER', 'CHANGE_TEXT', 'ADD_IMAGE');

-- CreateTable
CREATE TABLE "roomEvents" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "eventType" "EventType" NOT NULL,
    "description" TEXT,
    "shapeId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roomEvents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roomEvents_roomId_sequenceNumber_key" ON "roomEvents"("roomId", "sequenceNumber");

-- AddForeignKey
ALTER TABLE "roomEvents" ADD CONSTRAINT "roomEvents_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roomEvents" ADD CONSTRAINT "roomEvents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
