import { WebSocket } from "ws";
import { prismaClient } from "@repo/db/db";
import { roomMembers, users } from "../utils/inMemory.js";
import { RedisManager } from "../config/RedisManager.js";

export const selfMessageHandler = async (message: any, ws: WebSocket, userId: string) => {
  const userAuthenticated = { userId };
  const data = JSON.parse(message.toString());

  if (data.type === "join_room") {
    const user = users.find((u) => u.ws === ws);
    if (user && !user.rooms.includes(data.roomId)) {
      user.rooms.push(data.roomId);
    }

    let members = roomMembers[`room${data.roomId}`];
    if (!members) {
      members = [];
      roomMembers[`room${data.roomId}`] = members;
      console.log("Subscribing to Redis channel for room:", data.roomId);
      RedisManager.getInstance().getSubClient().subscribe(`room${data.roomId}`, (redisMessage) => {
        console.log("Redis broadcast to room:", data.roomId);
        const activeMembers = roomMembers[`room${data.roomId}`];
        activeMembers?.forEach((socket) => {
          socket.send(redisMessage);
        });
      });
    }

    if (!members.includes(ws)) {
      members.push(ws);
    }

    const curRoomUsers: Record<string, { firstName: string; lastName: string }> = {};

    try {
      const slugNum = Number(data.roomId);
      if (!isNaN(slugNum)) {
        const roomUsers = await prismaClient.user.findMany({
          where: {
            OR: [
              {
                rooms: {
                  some: {
                    slug: slugNum,
                  },
                },
              },
              {
                adminRooms: {
                  some: {
                    slug: slugNum,
                  },
                },
              },
            ],
          },
        });

        roomUsers.forEach((u) => {
          curRoomUsers[u.id] = {
            firstName: u.firstName,
            lastName: u.lastName,
          };
        });
      }
    } catch (e) {
      console.error("Failed to query room users from DB:", e);
      // Fallback to active in-memory users
      users
        .filter((u) => u.rooms.includes(data.roomId))
        .forEach((u) => {
          curRoomUsers[u.userId] = {
            firstName: u.firstName,
            lastName: u.lastName,
          };
        });
    }
    // Send joined_room confirmation only to the joining user
    ws.send(
      JSON.stringify({
        type: "joined_room",
        room: data.roomId,
        curRoomUsers,
        myUserId: userId,
      })
    );
  } else if (data.type === "leave_room") {
    const user = users.find((u) => u.ws === ws);
    const roomId = data.room;
    if (user) {
      const members = roomMembers[`room${roomId}`];
      if (members) {
        const index = members.indexOf(user.ws);
        if (index !== -1) {
          members.splice(index, 1);
        }
        if (members.length === 0) {
          delete roomMembers[`room${roomId}`];
          RedisManager.getInstance().getSubClient().unsubscribe(`room${roomId}`);
          console.log(`Unsubscribed and deleted empty room: ${roomId}`);
        }
      }
      user.rooms = user.rooms.filter((r) => r !== roomId);
    }
    ws.send(JSON.stringify({ type: "left_room", room: roomId }));


  } else if (data.type === "chat") {
    try {
      const room = await prismaClient.room.findUnique({
        where: { slug: Number(data.roomId) }
      });

      if (!room) {
        console.error("Room not found for slug:", data.roomId);
        return;
      }

      const shape = await prismaClient.shapes.create({
        data: {
          roomId: room.id,
          shape: data.shape,
          userId: userAuthenticated.userId
        },
      });

      const newShape = {
        id: shape.id,
        shape: JSON.parse(data.shape),
        userId: userAuthenticated.userId,
      };

      const payload = {
        type: "shape created",
        shape: newShape,
        roomId: data.roomId,
        userId: userAuthenticated.userId,
      };

      RedisManager.getInstance().getClient().publish(`room${data.roomId}`, JSON.stringify(payload));
    } catch (e) {
      console.error("Failed to create shape:", e);
    }
  } else if (data.type === "chat-multiple") {
    try {
      const room = await prismaClient.room.findUnique({
        where: { slug: Number(data.roomId) }
      });

      if (!room) {
        console.error("Room not found for slug:", data.roomId);
        return;
      }

      const shapes = await Promise.all(
        data.shapes.map((s: any) =>
          prismaClient.shapes.create({
            data: {
              roomId: room.id,
              shape: typeof s === 'string' ? s : JSON.stringify(s),
              userId: userAuthenticated.userId
            }
          })
        )
      );

      shapes.forEach((createdShape) => {
        const newShape = {
          id: createdShape.id,
          shape: JSON.parse(createdShape.shape),
          userId: userAuthenticated.userId,
        };

        const payload = {
          type: "shape created",
          shape: newShape,
          roomId: data.roomId,
          userId: userAuthenticated.userId,
        };

        RedisManager.getInstance().getClient().publish(`room${data.roomId}`, JSON.stringify(payload));
      });
    } catch (e) {
      console.error("Failed to create shapes:", e);
    }
  } else if (data.type === "clear") {
    try {
      const room = await prismaClient.room.findUnique({
        where: { slug: Number(data.roomId) }
      });

      if (!room) {
        console.error("Room not found for slug:", data.roomId);
        return;
      }

      await prismaClient.shapes.deleteMany({
        where: {
          roomId: room.id,
        },
      });

      const payload = {
        type: "cleared",
        from: userAuthenticated.userId,
      };

      RedisManager.getInstance().getClient().publish(`room${data.roomId}`, JSON.stringify(payload));
    } catch (e) {
      console.error("Internal server error during clear: ", e);
    }
  } else if (data.type === "update_shape") {
    const shapeId = Number(data.shapeId);
    const roomId = data.roomId || data.room;

    try {
      const updatedShape = await prismaClient.shapes.update({
        where: { id: shapeId },
        data: { shape: data.shape },
      });

      const payload = {
        type: "shape_updated",
        shape: updatedShape,
        from: userAuthenticated.userId,
      };

      RedisManager.getInstance().getClient().publish(`room${roomId}`, JSON.stringify(payload));
    } catch (e) {
      console.error("Failed to update shape:", e);
    }
  } else if (data.type === "delete_shape") {
    const shapeId = Number(data.shapeId);
    const roomId = data.roomId || data.room;

    try {
      await prismaClient.shapes.delete({
        where: { id: shapeId },
      });

      const payload = {
        type: "shape_deleted",
        shapeId: shapeId,
        from: userAuthenticated.userId,
      };

      RedisManager.getInstance().getClient().publish(`room${roomId}`, JSON.stringify(payload));
    } catch (e) {
      console.error("Failed to delete the shape:", e);
    }
  } else {
    console.warn("Unknown event type received:", data.type);
  }
};