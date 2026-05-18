"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { addAlias } from "@/lib/aliases-db";
import { toast } from "sonner";

export default function AliasForm({
  canonicalSuggestions,
}: {
  canonicalSuggestions: string[];
}) {
  const [alias, setAlias] = useState("");
  const [canonical, setCanonical] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await addAlias(alias, canonical);
      toast.success(`"${alias}" will now render as "${canonical}".`);
      setAlias("");
      setCanonical("");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't add alias.";
      const looksMissing = /relation .* does not exist/i.test(msg);
      toast.error(
        looksMissing
          ? "player_aliases table missing — run the Phase C migration in Supabase."
          : msg,
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"
    >
      <div>
        <label className="block text-[10px] font-bold text-white/50 uppercase mb-1.5 tracking-widest">
          Alias (typed variant)
        </label>
        <input
          type="text"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="toby"
          maxLength={24}
          autoComplete="off"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/40 transition-colors"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-white/50 uppercase mb-1.5 tracking-widest">
          Canonical display name
        </label>
        <input
          type="text"
          value={canonical}
          onChange={(e) => setCanonical(e.target.value)}
          placeholder="Toby"
          list="canonical-suggestions"
          maxLength={24}
          autoComplete="off"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/40 transition-colors"
        />
        <datalist id="canonical-suggestions">
          {canonicalSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <button
        type="submit"
        disabled={pending || !alias.trim() || !canonical.trim()}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-400/15 hover:bg-purple-400/25 border border-purple-400/40 text-purple-400 font-black uppercase text-xs tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        Add alias
      </button>
    </form>
  );
}
