import { WebSocket } from "ws";
import { prismaClient } from "@repo/db/db";
import { roomMembers, users } from "../utils/inMemory.js";
import { RedisManager } from "../config/RedisManager.js";
import { appendRoomEvent } from "../utils/eventLogger.js";
import { EventType } from "@repo/common/enum"

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
          } else if (parsed.type === "user_removed") {
            const targetUser = users.find((u) => u.userId === parsed.userId);
            if (targetUser) {
              targetUser.ws.send(JSON.stringify({ type: "kicked", roomId: parsed.roomId }));
              targetUser.ws.close();
            }
          }
        } catch (e) {
          console.error("Failed to process Redis message in subscription:", e);
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

      if (shape) {
        const shapeData = JSON.parse(data.shape);
        const description = shapeData.type === "text"
          ? `${user?.firstName} ${user?.lastName} created text "${shapeData.text || ""}"`
          : `${user?.firstName} ${user?.lastName} created a ${shapeData.type}`;

        await appendRoomEvent({
          roomId: room.id,
          userId: userAuthenticated.userId,
          description: description,
          shapeId: shape.id,
          eventType: data.eventType || EventType.CREATE_SHAPE,
          payload: data.shape
        });
      }

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
      const existingShapeRecord = await prismaClient.shapes.findUnique({
        where: { id: shapeId }
      });

      if (!existingShapeRecord) {
        ws.send(JSON.stringify({ message: "shape not found" }));
        return;
      }

      const existingShape = JSON.parse(existingShapeRecord.shape);
      const incomingShape = typeof data.shape === "string" ? JSON.parse(data.shape) : data.shape;

      const mergedShape = {
        ...existingShape,
        ...incomingShape
      };

      const updatedShape = await prismaClient.shapes.update({
        where: { id: shapeId },
        data: {
          shape: JSON.stringify(mergedShape),
          updatedByUserId: userAuthenticated.userId
        },
      });

      const room = await prismaClient.room.findUnique({
        where: {
          slug: Number(roomId)
        }
      })

      if (!room) {
        ws.send(JSON.stringify({ message: "room not found" }));
        return;
      }

      if (updatedShape && data.eventType) {
        let description;
        const shape = JSON.parse(updatedShape.shape);
        console.log(data)
        switch (data.eventType) {
          case EventType.ROTATE_SHAPE:
            description = `${user?.firstName} ${user?.lastName} rotated a ${shape.type} from ${Math.round(data.fromAngle)} to ${Math.round(data.toAngle)} degrees of #${shape.shapeId}`
            break;
          case EventType.MOVE_SHAPE:
            description = shape.type === "line" ? `${user?.firstName} ${user?.lastName} moved a ${shape.type} from start(${Math.round(data.fromStartX)}, ${Math.round(data.fromStartY)}), end(${Math.round(data.fromEndX)}, ${Math.round(data.fromEndY)}) to start(${Math.round(data.toStartX)}, ${Math.round(data.toStartY)}), end(${Math.round(data.toEndX)}, ${Math.round(data.toEndY)}) of #${shape.shapeId}` : `${user?.firstName} ${user?.lastName} moved a ${shape.type} from (${data.fromX}, ${data.fromY}) to (${data.toX}, ${data.toY}) of #${shape.shapeId}`
            break;
          case EventType.SCALE_SHAPE:
            description = shape.type !== "circle" && shape.type !== "line" ? `${user?.firstName} ${user?.lastName} resized a ${shape.type} from (${Math.round(data.fromWidth)}, ${Math.round(data.fromHeight)}) to (${Math.round(data.toWidth)}, ${Math.round(data.toHeight)}) of #${shape.shapeId}` : shape.type === "line" ? `${user?.firstName} ${user?.lastName} resized a line from (${Math.round(data.fromStartX)}, ${Math.round(data.fromStartY)}) to (${Math.round(data.toEndX)}, ${Math.round(data.toEndY)}) of #${shape.shapeId}` : `${user?.firstName} ${user?.lastName} resized a ${shape.type} from radius ${Math.round(data.fromRadius)} to ${Math.round(data.toRadius)} of #${shape.shapeId}`
            break;
          case EventType.CHANGE_FILL:
            description = `${user?.firstName} ${user?.lastName} changed the fill color of a ${shape.type} from ${data.fromColor} to ${data.toColor} of #${shape.shapeId}`
            break;
          case EventType.CHANGE_STROKE:
            description = `${user?.firstName} ${user?.lastName} changed the ${shape.type === "text" ? "text" : "border"} color of a ${shape.type} from ${data.fromColor} to ${data.toColor} of #${shape.shapeId}`
            break;
          case EventType.CHANGE_LAYER:
            description = `${user?.firstName} ${user?.lastName} changed the layer of a ${shape.type} from z-index ${Math.round(data.fromZ)} to ${Math.round(data.toZ)} of #${shape.shapeId}`
            break;
          case EventType.CHANGE_TEXT:
            description = `${user?.firstName} ${user?.lastName} updated text from "${data.fromText}" to "${data.toText}" of #${shape.shapeId}`
            break;
          case EventType.ADD_IMAGE:
            description = `${user?.firstName} ${user?.lastName} added an image of #${shape.shapeId}`
            break;
          default:
            break;
        }
        await appendRoomEvent({ roomId: room.id, userId: userAuthenticated.userId, description: description, shapeId: updatedShape.id, eventType: data.eventType, payload: data.shape })
      }

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
      const deletedShape = await prismaClient.shapes.delete({
        where: { id: shapeId },
      });

      if (deletedShape) {
        const description = `${user?.firstName} ${user?.lastName} deleted a ${JSON.parse(deletedShape.shape).type}`
        const room = await prismaClient.room.findUnique({
          where: {
            id: deletedShape.roomId
          }
        })
        if (!room) {
          ws.send(JSON.stringify({ message: "room not found" }));
          return;
        }
        await appendRoomEvent({ roomId: room.id, userId: userAuthenticated.userId, description: description, shapeId: deletedShape.id, eventType: EventType.DELETE_SHAPE, payload: deletedShape.shape })
      }

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
  } else {
    console.warn("Unknown event type received:", data.type);
  }
};