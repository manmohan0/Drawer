"use client"
import { WS_URL } from "@/config";
import { useEffect, useState } from "react";
import { Canvas } from "./Canvas";
import { getCookie } from "@/utils/cookie";

export const RoomCanvas = ({ roomId } : { roomId: string }) => {
    const [WS, setWS] = useState<WebSocket | null>(null);

    useEffect(() => {
        const token = getCookie("Authorization") || "";
        const ws = new WebSocket(`${WS_URL}?token=${token}`);
        ws.onopen = () => {
            setWS(ws);
        }

        ws.onclose = (e) => {
            console.log(e)
        }

        return () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "leave_room",
                    roomId
                }));
            }
            ws.close();
        }
    }, [roomId])

    if (!WS) {
        return <div>
            connecting to server...
        </div>
    }

    return <Canvas roomId={roomId} ws={WS}/>
}