import axios from "axios"
import { BACKEND_URL } from "../../../config/HttpHandlers"
import { ChatRoom } from "../../../Components/ChatRoom"

const getRoomId = async (slug: string) => {
    const res = await axios.get(`${BACKEND_URL}/room/${slug}`,{
        headers: {
            "authorization": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1ODY4Mjg2ZC05Y2MzLTQzNzktOWFkZi0xN2QzMTRmNmRiM2MiLCJpYXQiOjE3NjExMDI4NTB9.c3OUsVFIqFbIazy4CXcQmF2kJKEfF2jbWUgi-YphCxw"
        }})
    return res.data.room.id
}

export default async function ChatRoom1({ params }: { params: { slug: string } }) {
    const parsedParams = await params;
    const slug = parsedParams.slug;
    const roomId = await getRoomId(slug);

    return <ChatRoom id={roomId} />
}