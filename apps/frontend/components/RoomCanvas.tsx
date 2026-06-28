"use client";
import { WS_URL } from "@/config";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas } from "./Canvas";
import { getCookie } from "@/utils/cookie";

export const RoomCanvas = ({ roomId }: { roomId: string }) => {
  const router = useRouter();
  const [WS, setWS] = useState<WebSocket | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const token = getCookie("Authorization");
    if (!token) {
      router.push("/signin");
      return;
    }

    const ws = new WebSocket(`${WS_URL}`);

    ws.onopen = () => {
      // Unconditionally send auth message on open for secure post-handshake validation
      ws.send(
        JSON.stringify({
          type: "auth",
          token,
        }),
      );
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "authenticated") {
          setWS(ws);
        } else if (data.type === "error") {
          console.error("WebSocket authentication error:", data.message);
          ws.close();
        }
      } catch (err) {
        console.error(
          "Error processing WebSocket message during authentication:",
          err,
        );
      }
    };

    ws.onclose = (e) => {
      console.log("WebSocket connection closed:", e);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "leave_room",
            roomId,
          }),
        );
      }
      ws.close();
    };
  }, [roomId, mounted, router]);

  if (!mounted || !WS) {
    return <div>connecting to server...</div>;
  }

  return <Canvas roomId={roomId} ws={WS} />;
};
