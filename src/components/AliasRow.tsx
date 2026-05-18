"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, ArrowRight } from "lucide-react";
import { deleteAlias, type AliasRecord } from "@/lib/aliases-db";
import { toast } from "sonner";

export default function AliasRow({ alias }: { alias: AliasRecord }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const remove = async () => {
    if (pending) return;
    if (!confirm(`Remove the "${alias.aliasLower}" → "${alias.canonicalName}" alias?`)) return;
    setPending(true);
    try {
      await deleteAlias(alias.aliasLower);
      toast.success("Alias removed.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove alias.");
      setPending(false);
    }
  };

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
      <div className="min-w-0 flex items-center gap-2 flex-wrap">
        <code className="font-mono text-xs text-white/60 bg-black/30 rounded px-1.5 py-0.5">
          {alias.aliasLower}
        </code>
        <ArrowRight size={12} className="text-white/30 shrink-0" />
        <span className="text-sm font-bold text-purple-400 truncate">
          {alias.canonicalName}
        </span>
        <span className="text-[10px] text-white/30 tracking-widest uppercase">
          {new Date(alias.createdAt).toLocaleDateString()}
          {alias.createdByName ? ` · ${alias.createdByName}` : ""}
        </span>
      </div>
      <button
        onClick={remove}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/40 text-white/40 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase transition-colors disabled:opacity-50 shrink-0"
      >
        {pending ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
        Remove
      </button>
    </li>
  );
}
