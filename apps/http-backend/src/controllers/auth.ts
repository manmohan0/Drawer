import { Request, Response } from "express"
import bcryptjs from "bcryptjs"
import jwt from "jsonwebtoken"
import { signUpSchema, signInSchema } from "@repo/common/types"
import { User } from "../models/authModel"
import { JWT_SECRET } from "@repo/backend-common/config"

export const signUp = async (req: Request, res: Response) => {

    const parsedBody = signUpSchema.parse(req.body)

    const existingUser = await User.findOne({ email: parsedBody.email })
    
    if (existingUser) {
        res.status(400).json({ message: "User with this email already exists" })
        return
    }

    const hashedPassword = bcryptjs.hashSync(parsedBody.password, 12);

    await User.create({
        firstName: parsedBody.firstName,
        lastName: parsedBody.lastName,
        email: parsedBody.email,
        password: hashedPassword,
    })

    res.status(201).json({ message: "User created successfully" })
}

export const signIn = async (req: Request, res: Response) => {

    const parsedBody = signInSchema.parse(req.body)

    const user = await User.findOne({ email: parsedBody.email })
    
    if (!user) {
        res.status(400).json({ message: "User does not exist" })
        return
    }

    const isPasswordValid = bcryptjs.compareSync(parsedBody.password, user.password)

    if (!isPasswordValid) {
        res.status(400).json({ message: "Invalid password" })
        return
    }

    const authToken = jwt.sign({ userId: user._id }, JWT_SECRET)

    res.status(200).json({ message: "Sign-in successful", authToken })
    return
}