"use client";

import styles from "./page.module.css";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [roomId, setRoomId] = useState("");
  const router = useRouter()
  return (
    <div className={styles.page}>
      <input value={roomId} onChange={(e) => setRoomId(e.target.value)} type="text" name="roomId" id="roomId" />
      <button onClick={() => router.push(`/room/${roomId}`)}>Join room</button>
    </div>
  );
}
