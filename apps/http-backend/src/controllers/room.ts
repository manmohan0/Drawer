import { Request, Response } from "express";

export const createRoom = async (req: Request, res: Response) => {
    res.status(201).json({ message: "Room created successfully" });
}