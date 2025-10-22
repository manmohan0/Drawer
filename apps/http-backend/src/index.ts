import express from "express";
import dotenv from "dotenv";
import authRouter from "./routes/auth.route.js";
import roomRouter from "./routes/room.route.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use('/auth', authRouter);
app.use('/room', roomRouter);

app.listen(3001, async () => {
  console.log("HTTP Backend is running on http://localhost:3001")
})