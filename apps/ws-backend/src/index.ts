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

const wss = new WebSocketServer({ port: 8080 });

const checkUser = (token: string): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    
    return decoded;
  } catch (err) {
    return null;
  }
}

interface User {
  userId: string;
  ws: WebSocket;
  rooms: string[];
}

const users: User[] = []

wss.on("connection", (ws, req) => {
  const url = req.url;

  if (!url) {
    return;
  }

  const quertParams = new URLSearchParams(url?.split("?")[1]);
  const token = quertParams.get("token") || "";

  const userAuthenticated = checkUser(token);

  if (!userAuthenticated || !userAuthenticated.userId) {
    ws.close();
    return;
  }

  users.push({ 
    userId: userAuthenticated?.userId, 
    ws, 
    rooms: [] 
  });

  ws.on("message", async (message) => {
    const data = JSON.parse(message.toString());

    if (data.type === "join_room") {
      const user = users.find(u => u.ws === ws);
      if (user && !user.rooms.includes(data.room)) {
        user.rooms.push(data.room);
      }
      ws.send(JSON.stringify({ type: "joined_room", room: data.room }));
    }

    if (data.type === "leave_room") {
      const user = users.find(u => u.ws === ws);
      if (user) {
        user.rooms = user.rooms.filter(r => r !== data.room);
      }
      ws.send(JSON.stringify({ type: "left_room", room: data.room }));
    }

    if (data.type === "chat") {
      
      await prismaClient.chat.create({
        data: {
          userId: userAuthenticated.userId,
          roomId: data.roomId,
          message: data.message
        }
      })

      users.forEach(user => {
        if (user.rooms.includes(data.room)) {
          user.ws.send(JSON.stringify({ 
            type: "chat", 
            message: data.message, 
            roomId: data.roomId, 
            from: userAuthenticated.userId
          }));
        }
      });
    }
  });
});
