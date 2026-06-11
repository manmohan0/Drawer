import { RoomCanvas } from "@/components/RoomCanvas";

export default async function Canvas({ params } : { params: Promise<{ roomId: string }> }) {
    const roomId = (await params).roomId

    return <RoomCanvas roomId={roomId}/>
}