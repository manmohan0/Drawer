import { roomSchema } from "@repo/common/types";
import { prismaClient } from "@repo/db/db";
import { Request, Response } from "express";
import roles from "../config/roles.js";
import { RedisManager } from "../config/RedisManager.js";

export const getMyRooms = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const myRooms = await prismaClient.room.findMany({
      where: {
        roomUsers: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        roomUsers: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    const roomsWithAdmin = myRooms.map((room: any) => {
      const ownerEntry = room.roomUsers.find((ru: any) => ru.role === "Owner");
      return {
        id: room.id,
        slug: room.slug,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        admin: ownerEntry ? [ownerEntry.user] : [],
      };
    });

    res.status(200).json({ success: true, rooms: roomsWithAdmin });
  } catch (e) {
    console.error("Failed to fetch my rooms:", e);
    res.status(500).json({ message: "Internal server error" });
  }
};

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
        slug: Number(parsedBody.data.slug),
        roomUsers: {
          create: {
            userId: req.userId as string,
            role: "Owner",
          },
        },
      },
    });
    res
      .status(201)
      .json({ message: "Room created successfully", roomId: newRoom.id });
  } catch (e) {
    console.log(e);
    res.status(411).json({ message: "Room with that slug already exists" });
    return;
  }
};

export const joinRoom = async (req: Request, res: Response) => {
  const parsedBody = roomSchema.safeParse(req.body);

  if (parsedBody.error) {
    res.status(411).json({
      message: "Invalid inputs",
      error: parsedBody.error,
    });
    return;
  }

  try {
    const slugNum = Number(parsedBody.data.slug);
    const room = await prismaClient.room.findUnique({
      where: {
        slug: slugNum,
      },
      include: {
        roomUsers: {
          where: {
            userId: req.userId as string,
          },
        },
      },
    });

    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }

    if (room.roomUsers.length > 0) {
      res.status(200).json({
        success: true,
        message: "User already in room",
        roomId: room.id,
        slug: room.slug,
      });
      return;
    }

    await prismaClient.roomUser.create({
      data: {
        roomId: room.id,
        userId: req.userId as string,
        role: "Editor",
      },
    });
    res.status(200).json({
      success: true,
      message: "Joined room successfully",
      slug: room.slug,
    });
  } catch (e) {
    console.error("Failed to join room:", e);
    res.status(500).json({ success: false, message: "Failed to join room" });
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
      where: { slug: Number(slug) },
      include: {
        roomUsers: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }

    const myRole = room.roomUsers.find(
      (ru: any) => ru.userId === req.userId,
    )?.role;

    if (!myRole) {
      return res.status(403).json({
        success: false,
        message: "You cannot join the room because role not found",
      });
    }

    const owners = room.roomUsers
      .filter((ru: any) => ru.role === "Owner")
      .map((ru: any) => ru.user)[0];
    const mappedRoom = {
      id: room.id,
      slug: room.slug,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      admin: owners,
    };

    res.status(200).json({ room: mappedRoom, myRole });
  } catch (e) {
    res.status(500).json({ message: "Failed to retrieve room" });
  }
};

export const getExistingShapesById = async (req: Request, res: Response) => {
  let { roomId } = req.params;

  try {
    const room = await prismaClient.room.findUnique({
      where: { slug: Number(roomId) },
    });

    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }

    const shapes = await prismaClient.shapes.findMany({
      where: {
        roomId: room.id,
      },
    });

    const correctShapes = shapes.map((shape: any) => {
      const curShape = {
        id: shape.id,
        userId: shape.createdByUserId,
        updatedByUserId: shape.updatedByUserId,
        ...JSON.parse(shape.shape),
      };
      return curShape;
    });

    return res.status(200).json({
      message: shapes.length > 0 ? "Shapes found" : "No shaped found",
      shapes: correctShapes,
    });
  } catch (e) {
    res.json({
      message: "DB error",
    });
  }
};

export const getRoomMembersAndData = async (req: Request, res: Response) => {
  const { slug } = req.params;

  if (!slug) {
    res.status(400).json({ message: "Room ID is required" });
    return;
  }

  try {
    const room = await prismaClient.room.findUnique({
      where: { slug: Number(slug) },
      include: {
        roomUsers: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }

    const owner = room.roomUsers.find((ru: any) => ru.role === "Owner");
    const mappedRoom = {
      id: room.id,
      slug: room.slug,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      admin: owner ? owner.user : null,
      members: room.roomUsers.map((ru: any) => ({
        userId: ru.userId,
        role: ru.role,
        firstName: ru.user.firstName,
        lastName: ru.user.lastName,
        email: ru.user.email,
        joinedAt: ru.createdAt,
      })),
    };

    res
      .status(200)
      .json({ success: true, room: mappedRoom, currentUserId: req.userId });
  } catch (e) {
    res.status(500).json({ message: "Failed to retrieve room" });
  }
};

export const updateRole = async (req: Request, res: Response) => {
  try {
    const { role, userId } = req.body;
    const { slug } = req.params;
    const myUserId = req.userId;

    if (userId === myUserId) {
      return res
        .status(403)
        .json({ success: false, message: "You cannot update your own role" });
    }

    const room = await prismaClient.room.findUnique({
      where: {
        slug: Number(slug),
      },
    });

    if (!room) {
      return res
        .status(404)
        .json({ success: false, message: "Room not found" });
    }

    const myRoomUser = await prismaClient.roomUser.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: myUserId as string,
        },
      },
    });

    if (!myRoomUser) {
      return res
        .status(403)
        .json({ success: false, message: "You aren't member of this room" });
    }

    const roomUser = await prismaClient.roomUser.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: userId,
        },
      },
    });

    if (!roomUser) {
      return res.status(404).json({
        success: false,
        message: "User does not exist or isn't member of this room",
      });
    }

    if (roomUser.role === role) {
      return res.status(403).json({
        success: false,
        message: "Updated role should be different than current",
      });
    }

    const myRole = roles[myRoomUser.role];
    const roleValue = roles[role as string];
    const userRoleValue = roles[roomUser.role];

    if ((myRole as number) <= (userRoleValue as number)) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update role",
      });
    }

    if (
      (myRole as number) < (roleValue as number) ||
      (myRoomUser.role !== "Owner" &&
        (myRole as number) <= (roleValue as number))
    ) {
      return res.status(403).json({
        success: false,
        message: "You can't update role to higher than or equal to yours",
      });
    }

    if (role === "Owner") {
      await prismaClient.$transaction([
        prismaClient.roomUser.update({
          where: {
            roomId_userId: {
              roomId: room.id,
              userId: myUserId as string,
            },
          },
          data: {
            role: "Editor",
          },
        }),
        prismaClient.roomUser.update({
          where: {
            roomId_userId: {
              roomId: room.id,
              userId: userId,
            },
          },
          data: {
            role: "Owner",
          },
        }),
      ]);
    } else {
      // Perform database update
      await prismaClient.roomUser.update({
        where: {
          roomId_userId: {
            roomId: room.id,
            userId: userId,
          },
        },
        data: {
          role: role as any,
        },
      });
    }

    // Publish role update to Redis channel room${slug} so ws-backend broadcasts it to all connected users
    try {
      const redisClient = RedisManager.getInstance().getClient();
      const updates = [{ userId, role }];
      if (role === "Owner") {
        updates.push({ userId: myUserId as string, role: "Editor" });
      }
      await redisClient.publish(
        `room${slug}`,
        JSON.stringify({
          type: "role_updated",
          roomId: slug,
          updates,
        }),
      );
    } catch (redisError) {
      console.error("Failed to publish role update to Redis:", redisError);
    }

    return res
      .status(200)
      .json({ success: true, message: "Role updated successfully" });
  } catch (e) {
    console.log(`Error: ${e}`);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

export const getRoomEvents = async (req: Request, res: Response) => {
  const { roomId } = req.params;

  try {
    const room = await prismaClient.room.findUnique({
      where: { slug: Number(roomId) },
      include: {
        roomUsers: {
          where: {
            userId: req.userId,
          },
        },
      },
    });

    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }

    const events = await prismaClient.roomEvents.findMany({
      where: {
        roomId: room.id,
      },
      orderBy: {
        sequenceNumber: "asc",
      },
    });

    return res.status(200).json({
      success: true,
      events,
    });
  } catch (e) {
    console.error("Failed to retrieve room events:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const removeUser = async (req: Request, res: Response) => {
  const { userId } = req.body;
  const { slug } = req.params;
  const myUserId = req.userId;

  if (userId === myUserId) {
    return res.status(400).json({
      success: false,
      message: "You cannot remove yourself from the room",
    });
  }

  try {
    const room = await prismaClient.room.findUnique({
      where: { slug: Number(slug) },
    });

    if (!room) {
      return res
        .status(404)
        .json({ success: false, message: "Room not found" });
    }

    // Check if the requester is the Owner
    const myRoomUser = await prismaClient.roomUser.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: myUserId as string,
        },
      },
    });

    if (!myRoomUser || myRoomUser.role !== "Owner") {
      return res.status(403).json({
        success: false,
        message: "Only the room owner can remove users",
      });
    }

    // Check if the target user is a member of the room
    const targetRoomUser = await prismaClient.roomUser.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: userId,
        },
      },
    });

    if (!targetRoomUser) {
      return res
        .status(404)
        .json({ success: false, message: "User is not a member of this room" });
    }

    // Delete the membership
    await prismaClient.roomUser.delete({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: userId,
        },
      },
    });

    // Publish to Redis channel so ws-backend can handle disconnection/cleanup
    try {
      const redisClient = RedisManager.getInstance().getClient();
      await redisClient.publish(
        `room${slug}`,
        JSON.stringify({
          type: "user_removed",
          roomId: slug,
          userId: userId,
        }),
      );
    } catch (redisError) {
      console.error("Failed to publish user removal to Redis:", redisError);
    }

    return res
      .status(200)
      .json({ success: true, message: "User removed successfully" });
  } catch (e) {
    console.error("Failed to remove user:", e);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
