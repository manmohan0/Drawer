import { roomSchema } from "@repo/common/types";
import { prismaClient } from "@repo/db/db";
import { Request, Response } from "express";

export const createRoom = async (req: Request, res: Response) => {
  const parsedBody = roomSchema.safeParse(req.body);

  if (parsedBody.error) {
    res.status(411).json({
      message: "Invalid inputs",
      error: parsedBody.error,
    });
    return;
  }

  try {
    const newRoom = await prismaClient.room.create({
      data: {
        slug: parsedBody.data.slug,
        adminId: req.userId as string,
      },
    });
    res.status(201).json({ message: "Room created successfully", roomId: newRoom.id });
  } catch (e) {
    res.status(411).json({ message: "Room with that slug already exists" });
    return;
  }
};

export const getChatsByRoomId = async (req: Request, res: Response) => {
  const { roomId } = req.params;
  
  if (!roomId) {
    res.status(400).json({ message: "Room ID is required" });
    return;
  }

  try {
    const chats = await prismaClient.chat.findMany({
      where: { roomId: Number(roomId) },
      orderBy: { createdAt: "asc" },
    });

    res.status(200).json({ chats });
  } catch (e) {
    res.status(500).json({ message: "Failed to retrieve chats" });
  }
};

export const getChatsBySlug = async (req: Request, res: Response) => {
  const { slug } = req.params;

  try {
    const room = await prismaClient.room.findFirst({
      where: { slug }
    })
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    res.status(200).json({ room });
  } catch (e) {
    res.status(500).json({ message: "Failed to retrieve room" });
  }
};