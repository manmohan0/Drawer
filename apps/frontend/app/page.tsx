"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { BACKEND_URL } from "@/config";
import { getCookie, deleteCookie } from "@/utils/cookie";

export default function Home() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [roomSlug, setRoomSlug] = useState("");
  const [joinSlug, setJoinSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsClient(true);
    setToken(getCookie("Authorization") || null);
  }, []);

  const handleLogout = () => {
    deleteCookie("Authorization");
    setToken(null);
    router.refresh();
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    if (!roomSlug || isNaN(Number(roomSlug))) {
      setError("Room code must be a valid number.");
      setLoading(false);
      return;
    }

    try {
      const res = await axios.post(
        `${BACKEND_URL}/room/createRoom`,
        { slug: Number(roomSlug) },
        {
          headers: {
            Authorization: token || "",
          },
          withCredentials: true,
        },
      );

      setSuccess("Room created successfully! Redirecting...");
      setTimeout(() => {
        router.push(`/canvas/${roomSlug}`);
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.message ||
          "Failed to create room. The room code might already exist.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    if (!joinSlug || isNaN(Number(joinSlug))) {
      setError("Room code must be a valid number.");
      setLoading(false);
      return;
    }

    try {
      const res = await axios.post(
        `${BACKEND_URL}/room/joinRoom`,
        { slug: Number(joinSlug) },
        { withCredentials: true },
      );

      if (res && !res.data.success) {
        router.push("/signin");
        setLoading(false);
        return;
      }

      if (res && res.data.success) {
        setSuccess("Room found! Joining...");
        setTimeout(() => {
          router.push(`/canvas/${res.data.slug}`);
        }, 1500);
      }
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.message ||
          "Room not found. Please verify the room code.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isClient) {
    return null; // Prevent flash during hydration
  }

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white p-6 font-sans">
      <div className="w-full max-w-4xl flex flex-col items-center">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4">
            <span className="bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent">
              Drawer
            </span>
          </h1>
          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl">
            A real-time collaborative whiteboard drawing application. Sketch,
            resize, pan, zoom, and work together seamlessly.
          </p>
        </div>

        {error && (
          <div className="w-full max-w-md mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {success && (
          <div className="w-full max-w-md mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm text-center">
            {success}
          </div>
        )}

        {token ? (
          /* Logged In Dashboard */
          <div className="w-full max-w-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-md rounded-3xl p-8 shadow-2xl relative">
            <div className="flex justify-between items-center mb-8 border-b border-zinc-800/80 pb-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-200">Dashboard</h2>
                <p className="text-xs text-zinc-500">Welcome back to Drawer</p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/rooms"
                  className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl transition-all cursor-pointer"
                >
                  Go to Rooms
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded-xl transition-all cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Join Room */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-zinc-300">
                  Join a Room
                </h3>
                <form onSubmit={handleJoinRoom} className="space-y-3">
                  <input
                    type="text"
                    required
                    placeholder="Enter numeric room code..."
                    value={joinSlug}
                    onChange={(e) => setJoinSlug(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl px-4 py-3 text-sm transition-all outline-none"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 rounded-xl transition-all text-sm active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    Join Room
                  </button>
                </form>
              </div>

              {/* Create Room */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-zinc-300">
                  Create Room
                </h3>
                <form onSubmit={handleCreateRoom} className="space-y-3">
                  <input
                    type="text"
                    required
                    placeholder="Set numeric room code..."
                    value={roomSlug}
                    onChange={(e) => setRoomSlug(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl px-4 py-3 text-sm transition-all outline-none"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium py-3 rounded-xl transition-all text-sm shadow-lg shadow-orange-500/10 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    Create Room
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          /* Public Call To Action */
          <div className="flex flex-col items-center space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 mt-4">
              <Link href="/signin">
                <button className="w-48 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-orange-500/20 active:scale-[0.98] text-center cursor-pointer">
                  Sign In
                </button>
              </Link>
              <Link href="/signup">
                <button className="w-48 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800/80 hover:border-zinc-700 text-white font-semibold py-3 px-6 rounded-xl transition-all active:scale-[0.98] text-center cursor-pointer">
                  Create Account
                </button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
