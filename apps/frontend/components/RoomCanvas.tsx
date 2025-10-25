"use client"
import { WS_URL } from "@/config";
import { useEffect, useState } from "react";
import { Canvas } from "./Canvas";

export const RoomCanvas = ({ roomId } : { roomId: string }) => {
    const [WS, setWS] = useState<WebSocket | null>(null);

    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        ws.onopen = () => {
            setWS(ws);
            ws.send(JSON.stringify({
                type: "join_room",
                roomId
            }))
        }
        ws.onclose = (e) => {
            console.log(e)
        }
    }, [roomId])

    if (!WS) {
        return <div>
            connecting to server...
        </div>
    }

    return <div>
        <Canvas roomId={roomId} ws={WS} />
    </div> 
}