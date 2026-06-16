import express from "express";
import dotenv from "dotenv";
import cors from "cors"
import authRouter from "./routes/auth.route.js";
import roomRouter from "./routes/room.route.js";
import aiRouter from "./routes/ai.route.js";
import { cookieParser } from "./middlewares/cookieParser.middleware.js";

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}))

app.use(cookieParser);
app.use(express.json());
app.use('/auth', authRouter);
app.use('/room', roomRouter);
app.use('/ai', aiRouter);

app.listen(3001, async () => {
  console.log("HTTP Backend is running on http://localhost:3001")
})