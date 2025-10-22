import { Router } from "express";
import { createRoom, getChatsByRoomId } from "../controllers/room.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

export const roomRouter: Router = Router();

roomRouter.post("/createRoom", authMiddleware, createRoom);
roomRouter.get("/chats/:roomId", authMiddleware, getChatsByRoomId);
export default roomRouter;
