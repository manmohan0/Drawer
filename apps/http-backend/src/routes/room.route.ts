import { Router } from "express";
import { createRoom } from "../controllers/room";

export const roomRouter: Router = Router();

roomRouter.post('/createRoom', createRoom);

export default roomRouter;