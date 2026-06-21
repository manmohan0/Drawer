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

const port = process.env.PORT || 8200;
const wss = new WebSocketServer({ port: Number(port) });

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
  let isAuthenticated = false;
  let userObj: User | null = null;
  let authUserId: string | null = null;

  // Queue to buffer messages that arrive before authentication completes
  const tempMessageQueue: any[] = [];

  // Check if token exists in cookies for immediate authentication
  const cookieToken = req.headers.cookie?.split('Authorization=')[1]?.split(';')[0];
  
  const setupAuthenticatedUser = async (token: string): Promise<boolean> => {
    const userAuthenticated = checkUser(token);
    if (!userAuthenticated || !userAuthenticated.userId) {
      return false;
    }

    try {
      const dbUser = await prismaClient.user.findUnique({
        where: { id: userAuthenticated.userId }
      });

      if (!dbUser) {
        return false;
      }

      authUserId = userAuthenticated.userId;
      userObj = {
        userId: userAuthenticated.userId,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        ws,
        rooms: [],
      };
      users.push(userObj);
      isAuthenticated = true;

      // Send auth success notification to client
      ws.send(JSON.stringify({ type: "authenticated" }));

      // Attach drawing handlers
      ws.on("message", (message) => {
        selfMessageHandler(message, ws, authUserId!).catch((err) => {
          console.error("Error processing message:", err);
        });
      });

      // Play back any messages that arrived during the auth phase
      for (const message of tempMessageQueue) {
        selfMessageHandler(message, ws, authUserId!).catch((err) => {
          console.error("Error processing buffered message:", err);
        });
      }

      return true;
    } catch (e) {
      console.error("Database lookup during authentication failed:", e);
      return false;
    }
  };

  // Immediate authentication using handshake cookie if available
  if (cookieToken) {
    const success = await setupAuthenticatedUser(cookieToken);
    if (success) {
      console.log("Handshake cookie authentication successful");
    }
  }

  let authTimeout: any = null;

  // Fallback to message-based authentication if not authenticated by cookie
  if (!isAuthenticated) {
    // Terminate connection if authentication message is not received within 5 seconds
    authTimeout = setTimeout(() => {
      if (!isAuthenticated) {
        console.error("Authentication timeout: closing WebSocket connection");
        ws.send(JSON.stringify({ type: "error", message: "Authentication timeout" }));
        ws.close();
      }
    }, 5000);

    const handleAuthMessage = async (message: any) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "auth") {
          const success = await setupAuthenticatedUser(data.token);
          if (success) {
            if (authTimeout) clearTimeout(authTimeout);
            ws.removeListener("message", handleAuthMessage);
            console.log("Post-handshake message authentication successful");
          } else {
            ws.send(JSON.stringify({ type: "error", message: "Invalid authorization token" }));
            ws.close();
          }
        } else {
          // Buffer messages (like join_room) that arrive before auth is finished
          tempMessageQueue.push(message);
        }
      } catch (err) {
        console.error("Error parsing pre-authentication message:", err);
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
        ws.close();
      }
    };

    ws.on("message", handleAuthMessage);
  }

  ws.on("close", () => {
    if (authTimeout) clearTimeout(authTimeout);
    console.log("Connection closed");
    const userIndex = users.findIndex((u) => u.ws === ws);
    if (userIndex !== -1) {
      const user = users[userIndex];

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
