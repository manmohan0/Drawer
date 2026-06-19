import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { JWT_SECRET } from "@repo/backend-common/config";
import { prismaClient } from "@repo/db/db";

dotenv.config();

interface JwtPayload {
  userId: string;
  // Add other properties if they exist in your JWT payload
}

const wss = new WebSocketServer({ port: 8082 });

const checkUser = (token: string): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    return decoded;
  } catch (err) {
    console.error("checkUser: JWT verification failed:", err);
    return null;
  }
};

interface User {
  userId: string;
  firstName: string;
  lastName: string;
  ws: WebSocket;
  rooms: string[];
}

const users: User[] = [];

wss.on("connection", async (ws, req) => {
  const messageQueue: any[] = [];
  const bufferListener = (message: any) => {
    messageQueue.push(message);
  };
  ws.on("message", bufferListener);

  const token = req.headers.cookie?.split('Authorization=')[1]?.split(';')[0];

  if (!token) {
    console.error("No token found in cookies or query parameters");
    ws.send(JSON.stringify({ type: "error", message: "No authorization token found" }));
    ws.close();
    return;
  }

  const userAuthenticated = checkUser(token);

  if (!userAuthenticated || !userAuthenticated.userId) {
    console.error("Connection rejected: Invalid token authentication", { userAuthenticated });
    ws.close();
    return;
  }

  let dbUser = null;

  try {
    dbUser = await prismaClient.user.findUnique({
      where: { id: userAuthenticated.userId }
    });
  } catch (e) {
    console.error("Failed to query user details:", e);
  }

  if (!dbUser) {
    console.error("Connection rejected: User not found in DB for ID:", userAuthenticated.userId);
    ws.send(JSON.stringify({ type: "error", message: "User not found" }));
    ws.close();
    return;
  }

  const userObj: User = {
    userId: userAuthenticated.userId,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    ws,
    rooms: [],
  };
  users.push(userObj);

  console.log("Working")

  ws.removeListener("message", bufferListener);

  const messageHandler = async (message: any) => {
    const data = JSON.parse(message.toString());
    console.log(data)
    if (data.type === "join_room") {
      const user = users.find((u) => u.ws === ws);
      if (user && !user.rooms.includes(data.roomId)) {
        user.rooms.push(data.roomId);
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
      // Broadcast updated user list to all users in the room
      users.forEach((u) => {
        if (u.rooms.includes(data.roomId)) {
          u.ws.send(
            JSON.stringify({
              type: "joined_room",
              room: data.roomId,
              curRoomUsers,
              myUserId: u.userId,
            })
          );
        }
      });
    }

    if (data.type === "leave_room") {
      const user = users.find((u) => u.ws === ws);
      const roomId = data.room;
      if (user) {
        user.rooms = user.rooms.filter((r) => r !== roomId);
      }
      ws.send(JSON.stringify({ type: "left_room", room: roomId }));

      // Broadcast updated user list to remaining users in the room
      const curRoomUsers: Record<string, { firstName: string; lastName: string }> = {};
      users
        .filter((u) => u.rooms.includes(roomId))
        .forEach((u) => {
          curRoomUsers[u.userId] = {
            firstName: u.firstName,
            lastName: u.lastName,
          };
        });

      console.log("Updated room users on leave:", curRoomUsers);

      users.forEach((u) => {
        if (u.rooms.includes(roomId)) {
          u.ws.send(
            JSON.stringify({
              type: "joined_room",
              room: roomId,
              curRoomUsers,
              myUserId: u.userId,
            })
          );
        }
      });
    }

    if (data.type === "chat") {
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

        users.forEach((user) => {
          if (user.rooms.includes(data.roomId)) {
            user.ws.send(
              JSON.stringify({
                type: "shape created",
                shape: newShape,
                roomId: data.roomId,
                userId: userAuthenticated.userId,
              })
            );
          }
        });
      } catch (e) {
        console.error("Failed to create shape:", e);
      }
    }

    if (data.type === "chat-multiple") {
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

          users.forEach((user) => {
            if (user.rooms.includes(data.roomId)) {
              user.ws.send(
                JSON.stringify({
                  type: "shape created",
                  shape: newShape,
                  roomId: data.roomId,
                  userId: userAuthenticated.userId,
                })
              );
            }
          });
        });
      } catch (e) {
        console.error("Failed to create shapes:", e);
      }
    }

    if (data.type == "clear") {
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

        users.forEach((user) => {
          if (user.rooms.includes(data.roomId)) {
            user.ws.send(
              JSON.stringify({
                type: "cleared",
                from: userAuthenticated.userId,
              })
            );
          }
        });
      } catch (e) {
        console.log("Internal server error: ", e);
      }
    }

    if (data.type === "update_shape") {
      const shapeId = Number(data.shapeId);

      try {
        const updatedShape = await prismaClient.shapes.update({
          where: { id: shapeId },
          data: { shape: data.shape },
        });

        users.forEach((user) => {
          if (user.rooms.includes(data.room)) {
            user.ws.send(
              JSON.stringify({
                type: "shape_updated",
                shape: updatedShape,
                from: userAuthenticated.userId,
              })
            );
          }
        });
      } catch (e) {
        console.error("Failed to update shape:", e);
      }
    }

    if (data.type === "delete_shape") {
      const shapeId = Number(data.shapeId);
      
      try {
        await prismaClient.shapes.delete({
          where: { id: shapeId },
        });

        users.forEach((user) => {
          if (user.rooms.includes(data.room)) {
            user.ws.send(
              JSON.stringify({
                type: "shape_deleted",
                shapeId: shapeId,
                from: userAuthenticated.userId,
              })
            );
          }
        });
      } catch (e) {
        console.error("Failed to delete the shape:", e);
      }
    }
  };

  ws.on("message", messageHandler);

  for (const message of messageQueue) {
    messageHandler(message).catch((err) => {
      console.error("Error processing buffered message:", err);
    });
  }

  ws.on("close", () => {
    console.log("Connection closed");
    const userIndex = users.findIndex((u) => u.ws === ws);
    if (userIndex !== -1) {
      users.splice(userIndex, 1);
    }
  });
});
