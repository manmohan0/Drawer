import { Request, Response, NextFunction } from "express";

export const cookieParser = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const cookieHeader = req.headers.cookie || "";
  const cookies: Record<string, string> = {};

  if (cookieHeader) {
    cookieHeader.split(";").forEach((cookie) => {
      const parts = cookie.split("=");
      const key = parts[0]?.trim();
      if (key) {
        cookies[key] = decodeURIComponent((parts[1] || "").trim());
      }
    });
  }

  req.cookies = cookies;
  next();
};
