import { Router } from "express";
import { generateShapes } from "../controllers/ai.controller.js";

const aiRouter: Router = Router();

aiRouter.post("/generate", generateShapes);

export default aiRouter;
