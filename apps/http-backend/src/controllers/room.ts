import { roomSchema } from "@repo/common/types";
import { prismaClient } from "@repo/db/db";
import { Request, Response } from "express";

export const createRoom = async (req: Request, res: Response) => {
    const parsedBody = roomSchema.safeParse(req.body);

    if (parsedBody.error) {
        res.status(411).json({
            message: "Invalid inputs"
        })
        return
    }

    try {
        await prismaClient.room.create({
            data: {
                slug: parsedBody.data.slug,
                adminId: req.userId as string
            }
        })
    } catch (e) {
        res.status(411).json({ message: "Room with that slug already exists" });
        return;
    }
    res.status(201).json({ message: "Room created successfully" });
}