import { WebSocket } from "ws";
import { prismaClient } from "@repo/db/db";
import { roomMembers, users } from "../utils/inMemory.js";
import { RedisManager } from "../config/RedisManager.js";

export const selfMessageHandler = async (message: any, ws: WebSocket, userId: string) => {
  const userAuthenticated = { userId };
  const data = JSON.parse(message.toString());

  if (data.type === "join_room") {
    const user = users.find((u) => u.ws === ws);

    if (!user) {
      ws.send(JSON.stringify({ type: "join_room_failder" }));
      return
    }

    if (user && !user.rooms.includes(data.roomId)) {
      user.rooms.push(data.roomId);
    }

    // Fetch and cache the joining user's role in this room
    try {
      const slugNum = Number(data.roomId);
      if (!isNaN(slugNum)) {
        const dbRoomUser = await prismaClient.roomUser.findFirst({
          where: {
            room: { slug: slugNum },
            userId: userId
          }
        });
        if (dbRoomUser && user) {
          if (!user.roles) user.roles = {};
          user.roles[data.roomId] = dbRoomUser.role;
        }
      }
    } catch (dbError) {
      console.error("Failed to query and cache roomUser role:", dbError);
    }

    let members = roomMembers[`room${data.roomId}`];
    if (!members) {
      members = [];
      roomMembers[`room${data.roomId}`] = members;
      console.log("Subscribing to Redis channel for room:", data.roomId);
      RedisManager.getInstance().getSubClient().subscribe(`room${data.roomId}`, (redisMessage) => {
        console.log("Redis broadcast to room:", data.roomId);
        try {
          const parsed = JSON.parse(redisMessage);
          if (parsed.type === "role_updated") {
            // Update in-memory cached roles
            parsed.updates.forEach((up: any) => {
              const targetUser = users.find((u) => u.userId === up.userId);
              if (targetUser) {
                if (!targetUser.roles) targetUser.roles = {};
                targetUser.roles[parsed.roomId] = up.role;
              }
            });
          }
        } catch (e) {
          console.error("Failed to process role update in Redis subscription:", e);
        }

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
            roomUsers: {
              some: {
                room: {
                  slug: slugNum,
                },
              },
            },
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
    
    const payload = {
      canvasStartX: data.canvasStartX ?? 0,
      canvasStartY: data.canvasStartY ?? 0,
      canvasEndX: data.canvasEndX ?? -1,
      canvasEndY: data.canvasEndY ?? -1
    }

    RedisManager.getInstance().getClient().hSet(`room${data.roomId}:coordinates`, user.userId, JSON.stringify(payload))
      .catch((err) => console.error("Failed to set coordinates in Redis on join:", err));
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
      RedisManager.getInstance().getClient().hDel(`room${roomId}:coordinates`, user.userId).catch((err) => {
        console.error("Failed to delete coordinates in Redis on leave_room:", err);
      });
    }
    ws.send(JSON.stringify({ type: "left_room", room: roomId }));


  } else if (data.type === "chat") {
    const user = users.find((u) => u.ws === ws);
    if (user?.roles?.[data.roomId] === "Viewer") {
      console.warn(`User ${userId} is a Viewer. Shape creation blocked.`);
      return;
    }
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
          createdByUserId: userAuthenticated.userId,
          updatedByUserId: userAuthenticated.userId
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
    const user = users.find((u) => u.ws === ws);
    if (user?.roles?.[data.roomId] === "Viewer") {
      console.warn(`User ${userId} is a Viewer. Shapes creation blocked.`);
      return;
    }
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
              createdByUserId: userAuthenticated.userId,
              updatedByUserId: userAuthenticated.userId
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
    const user = users.find((u) => u.ws === ws);
    if (user?.roles?.[data.roomId] === "Viewer") {
      console.warn(`User ${userId} is a Viewer. Clear board blocked.`);
      return;
    }
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
    const user = users.find((u) => u.ws === ws);
    const targetRoomId = data.roomId || data.room;
    if (user?.roles?.[targetRoomId] === "Viewer") {
      console.warn(`User ${userId} is a Viewer. Shape update blocked.`);
      return;
    }
    const shapeId = Number(data.shapeId);
    const roomId = data.roomId || data.room;

    try {
      const updatedShape = await prismaClient.shapes.update({
        where: { id: shapeId },
        data: {
          shape: data.shape,
          updatedByUserId: userAuthenticated.userId
        },
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
    const user = users.find((u) => u.ws === ws);
    const targetRoomId = data.roomId || data.room;
    if (user?.roles?.[targetRoomId] === "Viewer") {
      console.warn(`User ${userId} is a Viewer. Shape deletion blocked.`);
      return;
    }
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
  } else if (data.type === "change_screen_coordinates") {
    const user = users.find(u => u.ws === ws);

    if (!user) {
      ws.send(JSON.stringify({}))
      return;
    }

    const roomId = data.roomId;

    const payload = {
      canvasStartX: data.canvasStartX,
      canvasStartY: data.canvasStartY,
      canvasEndX: data.canvasEndX,
      canvasEndY: data.canvasEndY
    }

    RedisManager.getInstance().getClient().hSet(`room${roomId}:coordinates`, user.userId, JSON.stringify(payload));
  } else if (data.type === "get_screen_coordinates") {
    const roomId = data.roomId;
    const userCoordinates = await RedisManager.getInstance().getClient().hGet(`room${roomId}:coordinates`, data.userId);
    if (!userCoordinates) {
      ws.send(JSON.stringify({ type: "get_screen_coordinates_fail" }));
      return;
    }
    ws.send(JSON.stringify({ type: "coordinates_received", coordinates: JSON.parse(userCoordinates) }));
  }
  else {
    console.warn("Unknown event type received:", data.type);
  }
};