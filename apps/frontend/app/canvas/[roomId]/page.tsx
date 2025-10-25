import { RoomCanvas } from "@/components/RoomCanvas";

// eslint-disable-next-line @next/next/no-async-client-component
export default async function Canvas({ params } : { params: { roomId: string }}) {
    const roomId = (await params).roomId

    return <RoomCanvas roomId={roomId}/>
}