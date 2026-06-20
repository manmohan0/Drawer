"use client"
import { WS_URL } from "@/config";
import { useEffect, useState } from "react";
import { Canvas } from "./Canvas";
import { getCookie } from "@/utils/cookie";

export const RoomCanvas = ({ roomId } : { roomId: string }) => {
    const [WS, setWS] = useState<WebSocket | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        const ws = new WebSocket(`${WS_URL}`);
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
    }, [roomId, mounted])

    if (!mounted || !WS) {
        return <div>
            connecting to server...
        </div>
    }

    return <Canvas roomId={roomId} ws={WS}/>
}