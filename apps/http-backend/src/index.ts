import express from "express";
import dotenv from "dotenv";
import { connectToMongoDB } from "./config/mongodb";
import authRouter from "./routes/auth.route";
import roomRouter from "./routes/room.route";

dotenv.config();

const app = express();

app.use(express.json());

app.use('/auth', authRouter);
app.use('/room', roomRouter);

app.listen(3001, async () => {
  await connectToMongoDB();
  console.log("HTTP Backend is running on http://localhost:3001")
})