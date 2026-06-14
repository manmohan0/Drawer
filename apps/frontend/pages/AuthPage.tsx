"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { BACKEND_URL } from "../config";
import Link from "next/link";

export const AuthPage = ({ isSignIn }: { isSignIn: boolean }) => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (isSignIn) {
        const res = await axios.post(
          `${BACKEND_URL}/auth/signIn`,
          { email, password },
          { withCredentials: true }
        );
        
        // Cookie is set automatically by the backend Set-Cookie header
        
        setSuccess("Signed in successfully! Redirecting...");
        setTimeout(() => {
          router.push("/");
        }, 1500);
      } else {
        await axios.post(
          `${BACKEND_URL}/auth/signUp`,
          { email, password, confirmPassword, firstName, lastName },
          { withCredentials: true }
        );
        
        setSuccess("Account created successfully! Redirecting to sign in...");
        setTimeout(() => {
          router.push("/signin");
        }, 1500);
      }
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.message ||
        err.response?.data?.error?.issues?.[0]?.message ||
        "An unexpected error occurred. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col justify-center items-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white p-4 font-sans">
      <div className="w-full max-w-md bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        {/* Glow effect overlay */}
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent mb-2">
            {isSignIn ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="text-sm text-zinc-400">
            {isSignIn ? "Sign in to access your canvas and start drawing" : "Get started with collaborative whiteboard drawing"}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-pulse">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {!isSignIn && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">First Name</label>
                <input
                  type="text"
                  required
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl px-4 py-3 text-sm transition-all outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Last Name</label>
                <input
                  type="text"
                  required
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl px-4 py-3 text-sm transition-all outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Email Address</label>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl px-4 py-3 text-sm transition-all outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl px-4 py-3 text-sm transition-all outline-none"
            />
          </div>

          {!isSignIn && (
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Confirm Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl px-4 py-3 text-sm transition-all outline-none"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-orange-500/20 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-sm cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : isSignIn ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-zinc-500">
          {isSignIn ? (
            <>
              Don't have an account?{" "}
              <Link href="/signup" className="text-orange-400 hover:underline hover:text-orange-300 transition-colors font-medium">
                Sign up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href="/signin" className="text-orange-400 hover:underline hover:text-orange-300 transition-colors font-medium">
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;