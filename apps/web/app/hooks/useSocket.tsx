import { useEffect, useState } from "react"

export const useSocket = () => {
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    useEffect(() => {
        const socket = new WebSocket("ws://localhost:8080?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1ODY4Mjg2ZC05Y2MzLTQzNzktOWFkZi0xN2QzMTRmNmRiM2MiLCJpYXQiOjE3NjExMDI4NTB9.c3OUsVFIqFbIazy4CXcQmF2kJKEfF2jbWUgi-YphCxw");
        socket.onopen = () => {
            setSocket(socket);
            setLoading(false);
        }
    },[]);
    return { socket, loading };
}