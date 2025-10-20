import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.headers['authorization'] || "";

    const decodedUser = jwt.verify(authToken, process.env.JWT_SECRET as string);

    if (!decodedUser) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    req.user = decodedUser;
    next();
}