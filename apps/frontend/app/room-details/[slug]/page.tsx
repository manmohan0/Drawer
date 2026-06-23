"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { BACKEND_URL } from "@/config";
import { getCookie } from "@/utils/cookie";
import { ArrowLeft, Loader2, Calendar, Shield, Users, Mail, Hash } from "lucide-react";

export default function RoomDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const getMembersList = () => {
    const list = [...(room?.members || [])];
    const hasOwner = list.some((m: any) => m.role === "Owner");
    if (!hasOwner && room?.admin) {
      list.unshift({
        userId: room.admin.id,
        role: "Owner",
        firstName: room.admin.firstName,
        lastName: room.admin.lastName,
        email: room.admin.email,
        joinedAt: room.createdAt,
      });
    }
    return list;
  };

  const handleRoleChange = async (memberUserId: string, newRole: string) => {
    const token = getCookie("Authorization");
    if (!token) return;

    setUpdatingUserId(memberUserId);
    try {
      const res = await axios.put(
        `${BACKEND_URL}/room/${slug}/updateRole`,
        { role: newRole, userId: memberUserId },
        {
          headers: {
            Authorization: token,
          },
          withCredentials: true,
        }
      );
      if (res.data && res.data.success) {
        // Refresh room details to reflect the change
        const roomRes = await axios.get(`${BACKEND_URL}/room/roomDetails/${slug}`, {
          headers: {
            Authorization: token,
          },
          withCredentials: true,
        });
        if (roomRes.data && roomRes.data.room) {
          setRoom(roomRes.data.room);
        }
      }
    } catch (err: any) {
      console.error("Failed to update role:", err);
      alert(err.response?.data?.message || "Failed to update role.");
    } finally {
      setUpdatingUserId(null);
    }
  };

  useEffect(() => {
    const token = getCookie("Authorization");
    if (!token) {
      router.push("/signin");
      return;
    }

    const fetchRoomDetails = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/room/roomDetails/${slug}`, {
          headers: {
            Authorization: token,
          },
          withCredentials: true,
        });
        if (res.data && res.data.room) {
          setRoom(res.data.room);
          setCurrentUserId(res.data.currentUserId || null);
        } else {
          setError("Could not retrieve room details.");
        }
      } catch (err: any) {
        console.error("Failed to load room details:", err);
        setError(err.response?.data?.message || "Failed to load room details.");
      } finally {
        setLoading(false);
      }
    };

    fetchRoomDetails();
  }, [slug, router]);

  if (loading) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-white">
        <Loader2 className="w-10 h-10 animate-spin text-orange-500 mb-4" />
        <p className="text-zinc-400 text-sm animate-pulse">Loading room details...</p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-white p-6">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-xl">
          <p className="text-red-400 text-sm">{error || "Room details not found."}</p>
          <button
            onClick={() => router.back()}
            className="w-full bg-zinc-850 hover:bg-zinc-800 border border-zinc-805 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all active:scale-[0.98]"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white p-6 md:p-8 font-sans">
      <div className="mx-auto space-y-8">

        {/* Header Navigation */}
        <div className="flex items-center space-x-3 pb-6 border-b border-zinc-800/80">
          <button
            onClick={() => router.push(`/canvas/${slug}`)}
            className="flex items-center justify-center p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent">
              Room Details
            </h1>
            <p className="text-xs text-zinc-500">View room properties and member roles</p>
          </div>
        </div>

        {/* Room Properties Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm rounded-2xl p-6 flex items-center space-x-4 shadow-sm hover:border-zinc-755 transition-colors">
            <div className="p-3 bg-orange-500/10 rounded-xl border border-orange-500/20 text-orange-400 flex-shrink-0">
              <Hash className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Room Code</span>
              <span className="text-xl font-bold font-mono text-zinc-200 mt-0.5 block truncate">{room.slug}</span>
            </div>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm rounded-2xl p-6 flex items-center space-x-4 shadow-sm hover:border-zinc-755 transition-colors">
            <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400 flex-shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Owner</span>
              <span className="text-base font-bold text-zinc-200 mt-0.5 block truncate" title={room.admin ? `${room.admin.firstName} ${room.admin.lastName}` : "No Owner"}>
                {room.admin ? `${room.admin.firstName} ${room.admin.lastName}` : "No Owner"}
              </span>
            </div>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm rounded-2xl p-6 flex items-center space-x-4 shadow-sm hover:border-zinc-755 transition-colors">
            <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400 flex-shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Created On</span>
              <span className="text-base font-bold text-zinc-200 mt-0.5 block truncate">
                {new Date(room.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm rounded-2xl p-6 flex items-center space-x-4 shadow-sm hover:border-zinc-755 transition-colors">
            <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400 flex-shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Total Members</span>
              <span className="text-xl font-bold text-zinc-200 mt-0.5 block truncate">{getMembersList().length}</span>
            </div>
          </div>
        </div>

        {/* Members Table Card */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm rounded-3xl p-6 md:p-8 shadow-xl">
          <div className="flex items-center justify-between pb-6 border-b border-zinc-800/60 mb-6">
            <h2 className="text-lg font-bold text-zinc-200 flex items-center">
              <Users className="w-4 h-4 mr-2 text-orange-400" />
              Room Members
            </h2>
          </div>

          {/* Members Table */}
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/40 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4 text-right">Joined Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850/60">
                {getMembersList().map((member: any) => {
                  const initials = `${member.firstName?.[0] || ""}${member.lastName?.[0] || ""}`.toUpperCase();
                  const roleStyle =
                    member.role === "Owner"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : member.role === "Editor"
                        ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700/60";

                  return (
                    <tr key={member.userId} className="group hover:bg-zinc-900/20 transition-all duration-150">
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold shadow-inner">
                            {initials}
                          </div>
                          <span className="font-semibold text-zinc-200 text-sm group-hover:text-white transition-colors">
                            {member.firstName} {member.lastName}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-zinc-400 text-sm font-mono">
                        <div className="flex items-center space-x-1.5">
                          <Mail className="w-3.5 h-3.5 text-zinc-650" />
                          <span>{member.email}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {member.userId === currentUserId ? (
                          <span className={`inline-flex px-3.5 py-1.5 text-[10px] font-bold rounded-lg border uppercase tracking-wider shadow-sm ${roleStyle}`}>
                            {member.role}
                          </span>
                        ) : updatingUserId === member.userId ? (
                          <div className="flex items-center space-x-1.5 text-[10px] text-zinc-500 font-bold uppercase py-1">
                            <Loader2 className="w-3 h-3 animate-spin text-orange-500" />
                            <span>Updating...</span>
                          </div>
                        ) : (
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border uppercase tracking-wider shadow-sm bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-orange-500/50 cursor-pointer transition-colors ${
                              member.role === "Owner"
                                ? "text-amber-400 border-amber-500/20 bg-amber-500/5"
                                : member.role === "Editor"
                                  ? "text-indigo-400 border-indigo-500/20 bg-indigo-500/5"
                                  : "text-zinc-400 border-zinc-700/60 bg-zinc-850"
                            }`}
                          >
                            <option value="Viewer">Viewer</option>
                            <option value="Editor">Editor</option>
                            <option value="Owner">Owner</option>
                          </select>
                        )}
                      </td>
                      <td className="py-4 px-4 text-zinc-500 text-xs text-right font-mono">
                        {new Date(member.joinedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Go back to Canvas Actions */}
        <div className="flex justify-center pt-2">
          <button
            onClick={() => router.push(`/canvas/${slug}`)}
            className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white px-8 py-3.5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-[0.98] shadow-lg shadow-orange-500/10 cursor-pointer"
          >
            Back to Whiteboard Canvas
          </button>
        </div>
      </div>
    </div>
  );
}
