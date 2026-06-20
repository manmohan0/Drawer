import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { JWT_SECRET } from "@repo/backend-common/config";
import { prismaClient } from "@repo/db/db";
import { selfMessageHandler } from "./handlers/messageHandlers.js";
import { roomMembers, User, users } from "./utils/inMemory.js";
import { RedisManager } from "./config/RedisManager.js";

dotenv.config();

interface JwtPayload {
  userId: string;
  // Add other properties if they exist in your JWT payload
}

const wss = new WebSocketServer({ port: 8081 });

const checkUser = (token: string): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    return decoded;
  } catch (err) {
    console.error("checkUser: JWT verification failed:", err);
    return null;
  }
};

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

  ws.removeListener("message", bufferListener);

  ws.on("message", (message) => {
    selfMessageHandler(message, ws, userAuthenticated.userId).catch((err) => {
      console.error("Error processing message:", err);
    });
  });

  for (const message of messageQueue) {
    selfMessageHandler(message, ws, userAuthenticated.userId).catch((err) => {
      console.error("Error processing buffered message:", err);
    });
  }

  ws.on("close", () => {
    console.log("Connection closed");
    const userIndex = users.findIndex((u) => u.ws === ws);
    if (userIndex !== -1) {
      const user = users[userIndex]

      user?.rooms.forEach(room => {
        const roomKey = `room${room}`
        const member = roomMembers[roomKey]

        if (member) {
          const memberIndex = member.findIndex((m) => m === ws);
          if (memberIndex !== -1) {
            member.splice(memberIndex, 1);
          }

          if (member.length === 0) {
            delete roomMembers[`room${room}`]
            RedisManager.getInstance().getSubClient().unsubscribe(roomKey)
            console.log(`Room ${room} unsubscribed and deleted`) 
          }
        }
      })
      users.splice(userIndex, 1);
    }
  });
});
