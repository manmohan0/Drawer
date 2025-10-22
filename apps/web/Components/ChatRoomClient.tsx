"use client";

import { useEffect, useState } from "react";
import { useSocket } from "../app/hooks/useSocket";

export const ChatRoomClient = ({ id, messages }: { id: string, messages: string[] }) => {
    const {socket, loading} = useSocket();
    const [chats, setChats] = useState<any[]>([]);
    const [currentChat, setCurrentChat] = useState<string>("");

    useEffect(() => {
        if (socket && !loading) {
            socket.send(JSON.stringify({ type: "join_room", roomId: id }));
            setChats(messages);
            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "chat") {
                    setChats((prevChats) => [...prevChats, data]);
                }
            }
        }

        return () => {
            socket?.close()
        }
    }, [id, loading, socket]);

    return (
        <div>
            <div>
                {chats.map((chat, index) => (
                    <div key={index}>
                        {chat.message}
                    </div>
                ))}
            </div>
            <input type="text" onChange={(e) => setCurrentChat(e.target.value)} />
            <button onClick={() => {
                    socket?.send(JSON.stringify({
                    type: "chat",
                    roomId: id,
                    message: currentChat
                }))
                setCurrentChat("");
            }}>
                Send Message   
            </button>
        </div>
    );
}