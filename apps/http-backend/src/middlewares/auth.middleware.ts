import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

interface CustomJwtPayload {
  userId: string;
}

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authToken = req.headers["authorization"] || "";
  try {
    const decodedUser = jwt.verify(
      authToken,
      process.env.JWT_SECRET as string,
    ) as CustomJwtPayload;

    if (!decodedUser || !decodedUser.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    req.userId = decodedUser.userId;
    next();
  } catch (e) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
