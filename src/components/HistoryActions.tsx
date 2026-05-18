"use client";

import { useState, useEffect, useMemo } from "react";
import { BadgeCheck, Edit2, Trash2, X, RotateCcw } from "lucide-react";
import { deleteGame, getGamePatch, patchGame } from "@/lib/local-store";
import { clearGameSettlementDb } from "@/lib/settlements-db";
import { softDeleteGame } from "@/lib/soft-delete-db";
import { recordAudit } from "@/lib/audit-log";
import { useIsMounted } from "@/lib/use-hydration";
import { useRouter } from "next/navigation";
import { HistoricalGame } from "@/lib/historical-games";
import { motion } from "framer-motion";
import { onSettlementToggled, emitSettlementToggled } from "@/lib/settlement-events";
import { toast } from "sonner";

type Props = {
  gameId: string;
  isAdmin: boolean;
  game: HistoricalGame;
  /**
   * Names of every player whose settlement needs ticking off (owers + payout
   * recipients). The "Settled" badge lights up only when every one of them
   * has been marked paid.
   */
  requiredPayers: string[];
  /**
   * Lower-cased player names already marked paid in Supabase, server-fetched
   * so non-admins see the correct state on first paint.
   */
  initialSettledKeys: string[];
};

export default function HistoryActions({ gameId, isAdmin, game, requiredPayers, initialSettledKeys }: Props) {
  const isMounted = useIsMounted();
  const router = useRouter();

  const requiredKeys = useMemo(
    () => requiredPayers.map((p) => p.toLowerCase()),
    [requiredPayers],
  );
  const [settledKeys, setSettledKeys] = useState<Set<string>>(
    () => new Set(initialSettledKeys),
  );
  const settled = requiredKeys.length > 0 && requiredKeys.every((k) => settledKeys.has(k));

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [editData, setEditData] = useState({
    date: game.date,
    duration: game.duration,
    location: game.location,
    totalPot: game.totalPot,
    blinds: game.blinds,
  });

  useEffect(() => {
    if (isMounted) {
      const patch = getGamePatch(gameId);
      if (patch) {
        setEditData(prev => ({
          ...prev,
          date: (patch.date as string) ?? prev.date,
          duration: (patch.duration as string) ?? prev.duration,
          location: (patch.location as string) ?? prev.location,
          totalPot: (patch.totalPot as number) ?? prev.totalPot,
          blinds: (patch.blinds as string) ?? prev.blinds,
        }));
      }
    }
  }, [isMounted, gameId]);

  // Re-derive when any per-player toggle on this game fires elsewhere on the
  // page. Empty playerName signals a game-wide reset.
  useEffect(() => {
    return onSettlementToggled((detail) => {
      if (detail.gameId !== gameId) return;
      setSettledKeys((prev) => {
        if (detail.playerName === "") return new Set();
        const next = new Set(prev);
        const key = detail.playerName.toLowerCase();
        if (detail.settled) next.add(key); else next.delete(key);
        return next;
      });
    });
  }, [gameId]);

  const handleSaveEdit = () => {
    patchGame(gameId, editData);
    void recordAudit("game", gameId, "edit", editData);
    setShowEditModal(false);
    router.refresh();
  };

  const handleDelete = async () => {
    // Local fallback so the UI updates instantly even if the network call
    // hiccups. The DB write is the authoritative copy that syncs across
    // devices — if it fails, we surface a toast but keep the local hide.
    deleteGame(gameId);
    try {
      await softDeleteGame(gameId);
    } catch (err) {
      console.error("[soft-delete] DB write failed", err);
      toast.error("Hidden locally, but the cross-device delete failed — try again or restore from /admin/restore.");
    }
    router.push("/games");
  };

  if (!isMounted) return null;

  return (
    <>
      <div className="flex items-center gap-2">
        {settled && (
          <div className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-lg bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] font-bold text-xs tracking-widest uppercase">
            <BadgeCheck size={14} />
            Settled
            {isAdmin && (
              <button
                onClick={async () => {
                  if (!confirm("Reset this game's settlement? Everyone will be marked as unpaid again.")) return;
                  try {
                    await clearGameSettlementDb(gameId);
                  } catch (err) {
                    console.error("[settlement] reset failed", err);
                    return;
                  }
                  setSettledKeys(new Set());
                  // Empty playerName signals a game-wide clear — every per-player
                  // button on the page re-reads its state in response.
                  emitSettlementToggled({ gameId, playerName: "", settled: false });
                }}
                title="Reset settlement"
                aria-label="Reset settlement"
                className="ml-1 inline-flex items-center justify-center w-6 h-6 rounded-md text-[#39FF14]/70 hover:text-white hover:bg-[#39FF14]/20 transition-colors"
              >
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        )}

        {isAdmin && (
          <>
            <button
              onClick={() => setShowEditModal(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-cyan-400/10 border border-white/10 hover:border-cyan-400/40 text-white/50 hover:text-cyan-400 font-bold text-xs uppercase transition-all"
              title="Edit game details"
            >
              <Edit2 size={12} />
              Edit
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/40 text-white/50 hover:text-red-400 font-bold text-xs uppercase transition-all"
              title="Delete game"
            >
              <Trash2 size={12} />
              Delete
            </button>
          </>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4"
          onClick={() => setShowEditModal(false)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0E1117] border border-white/10 rounded-2xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto"
          >
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute top-4 right-4 text-white/50 hover:text-white inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-black tracking-tight mb-4 uppercase pr-10">Edit Game</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-1.5">
                  Date
                </label>
                <input
                  type="text"
                  value={editData.date}
                  onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-1.5">
                  Duration
                </label>
                <input
                  type="text"
                  value={editData.duration}
                  onChange={(e) => setEditData({ ...editData, duration: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-1.5">
                  Blinds
                </label>
                <input
                  type="text"
                  value={editData.blinds}
                  onChange={(e) => setEditData({ ...editData, blinds: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-1.5">
                  Location
                </label>
                <input
                  type="text"
                  value={editData.location}
                  onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-1.5">
                  Pot (£)
                </label>
                <input
                  type="number"
                  value={editData.totalPot}
                  onChange={(e) => setEditData({ ...editData, totalPot: parseFloat(e.target.value) || 0 })}
                  step="0.01"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-bold uppercase text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 px-4 py-2 bg-cyan-400/20 hover:bg-cyan-400/30 border border-cyan-400/50 rounded-lg text-cyan-400 font-bold uppercase text-sm transition-colors"
              >
                Save
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0E1117] border border-red-500/30 rounded-2xl max-w-sm w-full p-6"
          >
            <h2 className="text-lg font-black tracking-tight mb-2 uppercase text-red-400">
              Delete Game?
            </h2>
            <p className="text-white/60 mb-6">
              This will permanently remove this game from history. This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-bold uppercase text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg text-red-400 font-bold uppercase text-sm transition-colors"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
