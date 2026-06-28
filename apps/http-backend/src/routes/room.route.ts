import { Router } from "express";
import {
  createRoom,
  getChatsByRoomId,
  getChatsBySlug,
  getExistingShapesById,
  joinRoom,
  getMyRooms,
  getRoomMembersAndData,
  updateRole,
  getRoomEvents,
  removeUser,
} from "../controllers/room.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

export const roomRouter: Router = Router();

roomRouter.post("/createRoom", authMiddleware, createRoom);
roomRouter.post("/joinRoom", authMiddleware, joinRoom);
roomRouter.put("/:slug/updateRole", authMiddleware, updateRole);
roomRouter.get("/myRooms", authMiddleware, getMyRooms);
roomRouter.get("/roomDetails/:slug", authMiddleware, getRoomMembersAndData);
roomRouter.get("/chats/:roomId", authMiddleware, getChatsByRoomId);
roomRouter.get("/shapes/:roomId", authMiddleware, getExistingShapesById);
roomRouter.get("/events/:roomId", authMiddleware, getRoomEvents);
roomRouter.delete("/:slug/removeUser", authMiddleware, removeUser);
roomRouter.get("/:slug", authMiddleware, getChatsBySlug);

export default roomRouter;
