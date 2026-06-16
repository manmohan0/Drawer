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
  const url = req.url;

  if (!url) {
    return;
  }

  const token = req.headers.cookie?.split('Authorization=')[1]?.split(';')[0];

  if (!token) {
    console.error("No token found in cookies");
    ws.send(JSON.stringify({ type: "error", message: "No authorization cookie found" }));
    ws.close();
    return;
  }

  const userAuthenticated = checkUser(token);

  if (!userAuthenticated || !userAuthenticated.userId) {
    ws.close();
    return;
  }

  const userObj: User = {
    userId: userAuthenticated.userId,
    firstName: "",
    lastName: "",
    ws,
    rooms: [],
  };
  users.push(userObj);

  prismaClient.user.findUnique({
    where: { id: userAuthenticated.userId }
  }).then((dbUser) => {
    if (dbUser) {
      userObj.firstName = dbUser.firstName;
      userObj.lastName = dbUser.lastName;
    } else {
      ws.send(JSON.stringify({ type: "error", message: "User not found" }));
      ws.close();
      const idx = users.indexOf(userObj);
      if (idx !== -1) users.splice(idx, 1);
    }
  }).catch((e) => {
    console.error("Failed to query user details:", e);
  });

  ws.on("message", async (message) => {
    const data = JSON.parse(message.toString());
    
    if (data.type === "join_room") {
      const user = users.find((u) => u.ws === ws);
      if (user && !user.rooms.includes(data.roomId)) {
        user.rooms.push(data.roomId);
      }

      const curRoomUsers: Record<string, { firstName: string; lastName: string }> = {};
      users
        .filter((u) => u.rooms.includes(data.roomId))
        .forEach((u) => {
          curRoomUsers[u.userId] = {
            firstName: u.firstName,
            lastName: u.lastName,
          };
        });

      const myUserId = userAuthenticated.userId;
      ws.send(JSON.stringify({ type: "joined_room", room: data.roomId, curRoomUsers, myUserId }));
    }

    if (data.type === "leave_room") {
      const user = users.find((u) => u.ws === ws);
      if (user) {
        user.rooms = user.rooms.filter((r) => r !== data.room);
      }
      ws.send(JSON.stringify({ type: "left_room", room: data.room }));
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
  });
});
