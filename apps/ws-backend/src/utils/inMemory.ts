import { WebSocket } from "ws";

export interface User {
  userId: string;
  firstName: string;
  lastName: string;
  ws: WebSocket;
  rooms: string[];
}

export const users: User[] = [];

export const roomMembers: {
  [roomId: string]: WebSocket[]
} = {}