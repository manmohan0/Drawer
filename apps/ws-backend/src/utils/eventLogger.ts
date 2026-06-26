import { prismaClient } from "@repo/db/db";
import { EventType } from "@repo/common/enum";

export async function appendRoomEvent({
  roomId,
  userId,
  eventType,
  shapeId,
  payload,
  description,
}: {
  roomId: number;
  userId: string;
  eventType: EventType;
  shapeId: number;
  payload: any;
  description?: string;
}) {
  let retries = 3;
  while (retries > 0) {
    try {
      const newEvent = await prismaClient.$transaction(async (tx) => {
        // Query the max sequence number inside the transaction
        const aggregation = await tx.roomEvents.aggregate({
          where: { roomId },
          _max: { sequenceNumber: true },
        });

        const nextSequenceNumber = (aggregation._max.sequenceNumber || 0) + 1;

        return await tx.roomEvents.create({
          data: {
            roomId,
            sequenceNumber: nextSequenceNumber,
            eventType,
            shapeId,
            userId,
            payload: typeof payload === "string" ? payload : JSON.stringify(payload),
            description,
          },
        });
      });

      return newEvent;
    } catch (error: any) {
      // Prisma error code for unique constraint violation is P2002
      if (error.code === "P2002") {
        retries--;
        if (retries === 0) {
          throw new Error("Failed to append event: too many concurrent edits. Please try again.");
        }
        // Brief backoff before retrying
        await new Promise((resolve) => setTimeout(resolve, 50));
      } else {
        throw error;
      }
    }
  }
}
