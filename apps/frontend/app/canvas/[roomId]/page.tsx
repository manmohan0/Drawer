"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const RoomCanvas = dynamic(
  () => import("@/components/RoomCanvas").then((mod) => mod.RoomCanvas),
  { ssr: false },
);

export default function Canvas({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);

  return <RoomCanvas roomId={roomId} />;
}
