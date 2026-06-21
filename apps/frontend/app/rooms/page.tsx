"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { BACKEND_URL } from "@/config";
import { getCookie, deleteCookie } from "@/utils/cookie";
import { ArrowLeft, Folder, Loader2, LogOut, Plus, Search, User } from "lucide-react";

export default function RoomsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const activeToken = getCookie("Authorization");
    if (!activeToken) {
      router.push("/signin");
      return;
    }
    setToken(activeToken);

    const fetchRooms = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/room/myRooms`, {
          headers: {
            Authorization: activeToken,
          },
          withCredentials: true,
        });
        if (res.data && res.data.rooms) {
          setRooms(res.data.rooms);
        }
      } catch (err) {
        console.error("Failed to load rooms:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRooms();
  }, [router]);

  const handleLogout = () => {
    deleteCookie("Authorization");
    router.push("/signin");
  };

  const filteredRooms = rooms.filter((room) =>
    String(room.slug).toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-white">
        <Loader2 className="w-10 h-10 animate-spin text-orange-500 mb-4" />
        <p className="text-zinc-400 text-sm animate-pulse">Loading your rooms...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white p-6 md:p-12 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Top Navigation / Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-zinc-800/80">
          <div className="flex items-center space-x-3">
            <Link href="/">
              <button className="flex items-center justify-center p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl transition-all cursor-pointer">
                <ArrowLeft className="w-4 h-4 text-zinc-400" />
              </button>
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent">
                My Rooms
              </h1>
              <p className="text-xs text-zinc-500">Collaborate with others inside your whiteboards</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 self-stretch sm:self-auto">
            <Link href="/">
              <button className="flex items-center space-x-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg shadow-orange-500/10 transition-all active:scale-[0.98] cursor-pointer">
                <Plus className="w-4 h-4" />
                <span>Create / Join Room</span>
              </button>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        {rooms.length > 0 && (
          <div className="relative max-w-md bg-zinc-900/50 border border-zinc-850 rounded-2xl p-1.5 focus-within:border-orange-500/50 transition-all duration-300">
            <div className="flex items-center space-x-2 pl-3">
              <Search className="w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search rooms by code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-200 placeholder-zinc-500 py-2 focus:ring-0 w-full"
              />
            </div>
          </div>
        )}

        {/* Rooms Grid */}
        {filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-zinc-900/20 border border-dashed border-zinc-800/80 rounded-3xl p-8 space-y-4">
            <div className="p-4 bg-zinc-900 rounded-full border border-zinc-800">
              <Folder className="w-8 h-8 text-zinc-600" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-zinc-300">No rooms found</h3>
              <p className="text-xs text-zinc-500 max-w-xs">
                {searchQuery ? "No rooms match your search query." : "You haven't joined or created any rooms yet."}
              </p>
            </div>
            <Link href="/">
              <button className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-650 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer">
                Go back to Dashboard
              </button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {filteredRooms.map((room) => {
              const mainAdmin = room.admin?.[0];
              return (
                <div
                  key={room.id}
                  className="bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm rounded-3xl p-6 hover:border-zinc-700 hover:shadow-xl hover:shadow-orange-500/[0.02] transition-all duration-300 flex flex-col justify-between space-y-6 group"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] bg-zinc-800 border border-zinc-750 text-zinc-400 font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg">
                        Room
                      </span>
                      <span className="text-[10px] text-zinc-500 font-medium">
                        {new Date(room.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h2 className="text-2xl font-bold font-mono tracking-tight text-white group-hover:text-orange-400 transition-colors">
                        Code: {room.slug}
                      </h2>
                      {mainAdmin && (
                        <div className="flex items-center text-xs text-zinc-400 space-x-1.5 pt-1">
                          <User className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="truncate">
                            Admin: {mainAdmin.firstName} {mainAdmin.lastName}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Link href={`/canvas/${room.slug}`}>
                    <button className="w-full bg-zinc-800 group-hover:bg-gradient-to-r group-hover:from-orange-500 group-hover:to-amber-500 text-white font-medium py-3 rounded-xl transition-all duration-350 text-xs active:scale-[0.98] shadow-md cursor-pointer border border-zinc-755 group-hover:border-transparent">
                      Enter Room
                    </button>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
