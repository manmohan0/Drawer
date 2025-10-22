import axios from "axios"
import { BACKEND_URL } from "../config/HttpHandlers"
import { ChatRoomClient } from "./ChatRoomClient"

const getChats = async (roomId: string) => {
    const res = await axios.get(`${BACKEND_URL}/room/chats/${roomId}`, {
        headers: {
            "authorization": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1ODY4Mjg2ZC05Y2MzLTQzNzktOWFkZi0xN2QzMTRmNmRiM2MiLCJpYXQiOjE3NjExMDI4NTB9.c3OUsVFIqFbIazy4CXcQmF2kJKEfF2jbWUgi-YphCxw"
        }
    })
    return res.data.chats
}

export const ChatRoom = async ({ id }: { id: string }) => {
    const chats = await getChats(id);
    return <ChatRoomClient id={id} messages={chats}/>
}