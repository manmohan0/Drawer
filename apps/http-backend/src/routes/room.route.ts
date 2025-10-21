import { Router } from "express";
import { createRoom } from "../controllers/room.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

export const roomRouter: Router = Router();

roomRouter.post('/createRoom', authMiddleware, createRoom);

export default roomRouter;