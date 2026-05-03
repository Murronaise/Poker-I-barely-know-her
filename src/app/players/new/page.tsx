"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Camera, User, Save, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import PlayerAvatar from "@/components/PlayerAvatar";
import AvatarPositioner from "@/components/AvatarPositioner";
import { supabase } from "@/lib/supabase";
import { addStoredPlayer, setAvatarPosition, type AvatarPosition } from "@/lib/local-store";
import { toast } from "sonner";

export default function NewPlayerPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [position, setPosition] = useState<AvatarPosition | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setAvatarUrl(objectUrl);
    setSelectedFile(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      setIsUploading(true);
      let finalAvatarUrl: string | null = avatarUrl;
      let dbSucceeded = false;

      // 1. Try Supabase storage upload (best effort)
      if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop();
        const fileName = `${trimmed.replace(/ /g, "-").toLowerCase()}-${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, selectedFile);
        if (!uploadError) {
          const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
          finalAvatarUrl = data.publicUrl;
        }
      }

      // 2. Try Supabase DB insert
      try {
        const { error: dbError } = await supabase
          .from("players")
          .insert([{ name: trimmed, avatar_url: finalAvatarUrl }]);
        if (!dbError) dbSucceeded = true;
      } catch {
        /* ignore */
      }

      // 3. Always persist to localStorage so the player shows up in the roster,
      //    whether or not Supabase is available.
      addStoredPlayer({
        name: trimmed,
        avatarUrl: finalAvatarUrl,
        createdAt: Date.now(),
      });

      // Save the avatar position too
      if (position) {
        setAvatarPosition(trimmed, position);
      }

      toast.success(
        dbSucceeded ? `${trimmed} added` : `${trimmed} added locally`,
        { description: dbSucceeded ? undefined : "Supabase unavailable — saved to this browser." }
      );

      router.push("/players");
    } catch (error) {
      console.error("Error creating player:", error);
      toast.error("Couldn't save the player. Try again?");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex-1 min-h-0 overflow-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-6 xl:px-12 py-5"
    >
      <div className="max-w-3xl mx-auto">
        <Link
          href="/players"
          className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors mb-4 shrink-0"
        >
          <ChevronLeft size={18} />
          <span>Back to Roster</span>
        </Link>

        <div className="flex items-center gap-3 mb-5 shrink-0">
          <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20 shrink-0">
            <UserPlus className="text-[#39FF14]" size={22} />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight uppercase leading-none">
              Add New Player
            </h1>
            <p className="text-white/50 text-base mt-2">
              Upload an avatar and adjust how it sits inside the circle.
            </p>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-7">

          <form onSubmit={handleSave} className="grid md:grid-cols-2 gap-6 items-start">
            {/* Left: name + click-to-upload preview */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center">
                <div
                  className="relative group cursor-pointer"
                  onClick={handleAvatarClick}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  <div
                    className={`w-32 h-32 rounded-full border-4 shadow-[0_0_30px_rgba(57,255,20,0.1)] overflow-hidden transition-all duration-300 ${
                      isUploading
                        ? "border-white/50 animate-pulse"
                        : "border-white/10 group-hover:border-[#39FF14]"
                    }`}
                  >
                    <PlayerAvatar
                      name={name || "?"}
                      avatarUrl={avatarUrl}
                      size={128}
                      className="w-full h-full"
                      position={position ?? undefined}
                    />
                  </div>

                  <div className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="text-white mb-1" size={20} />
                    <span className="text-xs font-bold tracking-widest uppercase text-white">
                      {avatarUrl ? "Replace" : "Upload"}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-white/40 mt-3 font-bold tracking-widest uppercase">
                  Click to {avatarUrl ? "replace" : "upload"}
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-white/70 uppercase tracking-widest mb-2">
                  <User size={14} className="text-[#39FF14]" />
                  Player Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Phil Ivey"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-white font-bold focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isUploading || !name.trim()}
                className={`w-full py-3.5 rounded-xl font-black text-lg tracking-widest uppercase flex items-center justify-center gap-3 transition-all ${
                  name.trim() && !isUploading
                    ? "bg-[#39FF14] text-black hover:bg-[#32e011] shadow-[0_0_30px_rgba(57,255,20,0.4)]"
                    : "bg-white/10 text-white/30 cursor-not-allowed"
                }`}
              >
                {isUploading ? (
                  <span className="animate-pulse">Saving...</span>
                ) : (
                  <>
                    <Save size={18} />
                    Save Player
                  </>
                )}
              </button>
            </div>

            {/* Right: positioner — visible once an image is selected */}
            <div className="bg-black/20 border border-white/10 rounded-xl p-5">
              <h3 className="text-sm font-bold tracking-widest uppercase text-white/60 mb-4">
                Frame the Avatar
              </h3>
              {avatarUrl ? (
                <AvatarPositioner
                  name={name || "__draft__"}
                  avatarUrl={avatarUrl}
                  size={200}
                  autosave={false}
                  onChange={setPosition}
                />
              ) : (
                <div
                  className="flex flex-col items-center justify-center text-center text-white/30 text-sm font-bold tracking-widest uppercase rounded-2xl border-2 border-dashed border-white/10"
                  style={{ minHeight: 240 }}
                >
                  Upload an image to position it
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </motion.main>
  );
}
