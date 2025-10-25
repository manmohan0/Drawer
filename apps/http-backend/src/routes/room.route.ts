import { Router } from "express";
import { createRoom, getChatsByRoomId, getChatsBySlug, getExistingShapesById } from "../controllers/room.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

export const roomRouter: Router = Router();

roomRouter.post("/createRoom", authMiddleware, createRoom);
roomRouter.get("/chats/:roomId", authMiddleware, getChatsByRoomId);
roomRouter.get("/:slug", authMiddleware, getChatsBySlug);
roomRouter.get('/shapes/:roomId', authMiddleware, getExistingShapesById);

export default roomRouter;
