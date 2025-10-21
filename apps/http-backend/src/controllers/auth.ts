import { Request, Response } from "express";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { signUpSchema, signInSchema } from "@repo/common/types";
import { JWT_SECRET } from "@repo/backend-common/config";
import { prismaClient } from "@repo/db/db";

export const signUp = async (req: Request, res: Response) => {
  const parsedBody = signUpSchema.safeParse(req.body);

  if (parsedBody.error) {
    res.json({
      message: "invalid inputs",
      error: parsedBody.error,
    });
    return;
  }

  const existingUser = await prismaClient.user.findUnique({
    where: {
      email: parsedBody.data.email,
    },
  });

  if (existingUser) {
    res.status(400).json({ message: "User with this email already exists" });
    return;
  }

  const hashedPassword = bcryptjs.hashSync(parsedBody.data.password, 12);

  await prismaClient.user.create({
    data: {
      firstName: parsedBody.data.firstName,
      lastName: parsedBody.data.lastName,
      email: parsedBody.data.email,
      password: hashedPassword,
    },
  });

  res.status(201).json({ message: "User created successfully" });
};

export const signIn = async (req: Request, res: Response) => {
  const parsedBody = signInSchema.safeParse(req.body);

  if (parsedBody.error) {
    res.json({
      message: "invalid inputs",
      error: parsedBody.error,
    });
    return;
  }

  const user = await prismaClient.user.findUnique({
    where: {
      email: parsedBody.data.email,
    },
  });

  if (!user) {
    res.status(400).json({ message: "User does not exist" });
    return;
  }

  const isPasswordValid = bcryptjs.compareSync(
    parsedBody.data.password,
    user.password,
  );

  if (!isPasswordValid) {
    res.status(400).json({ message: "Invalid password" });
    return;
  }

  const authToken = jwt.sign({ userId: user.id }, JWT_SECRET);

  res.status(200).json({ message: "Sign-in successful", authToken });
  return;
};
