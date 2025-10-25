'use client';
import { Button } from "@/components/Button";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col space-y-2 min-h-screen items-center justify-center text-white bg-zinc-50 font-sans dark:bg-black">
      <div>
        Drawer Frontend
      </div>
      <div className="flex space-x-2">
        <Link href="/signin">
          <Button isPrimary label="Sign In" onClick={() => console.log("Signing In")} />
        </Link>
        <Link href="/signup">
          <Button label="Sign Up" onClick={() => console.log("Signing Up")} isPrimary={false} />
        </Link>
      </div>
    </div>
  );
}
