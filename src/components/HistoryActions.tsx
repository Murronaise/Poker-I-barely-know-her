"use client";

import { useState, useEffect, useMemo } from "react";
import { BadgeCheck, Edit2, Trash2, X, RotateCcw, Plus, Trash } from "lucide-react";
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
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { updateGameAndPlayers } from "@/lib/games-db";
import PlayerAvatar from "@/components/PlayerAvatar";

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
    blinds: game.blinds,
  });

  const [editPlayers, setEditPlayers] = useState(() =>
    game.players.map((p) => ({
      name: p.name,
      buyIn: p.buyIn,
      cashOut: p.cashOut,
      food: p.food,
    }))
  );

  const [allPlayersList, setAllPlayersList] = useState<string[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenEdit = () => {
    setEditData({
      date: game.date,
      duration: game.duration,
      location: game.location,
      blinds: game.blinds,
    });
    setEditPlayers(
      game.players.map((p) => ({
        name: p.name,
        buyIn: p.buyIn,
        cashOut: p.cashOut,
        food: p.food,
      }))
    );
    setShowEditModal(true);
  };

  // Load all players for autocomplete in modal
  useEffect(() => {
    let cancelled = false;
    const sb = createSupabaseBrowserClient();
    sb.from("players")
      .select("name")
      .then(({ data }) => {
        if (!cancelled && data) {
          setAllPlayersList(data.map((p) => p.name).sort());
        }
      });
    return () => { cancelled = true; };
  }, []);

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

  const totalBuyIn = useMemo(() => editPlayers.reduce((sum, p) => sum + p.buyIn, 0), [editPlayers]);
  const totalCashOut = useMemo(() => editPlayers.reduce((sum, p) => sum + p.cashOut, 0), [editPlayers]);
  const totalFood = useMemo(() => editPlayers.reduce((sum, p) => sum + p.food, 0), [editPlayers]);
  const isZeroSum = Math.abs(totalBuyIn - totalCashOut) < 0.005;

  const handlePlayerChange = (name: string, field: "buyIn" | "cashOut" | "food", val: number) => {
    setEditPlayers((prev) =>
      prev.map((p) => (p.name.toLowerCase() === name.toLowerCase() ? { ...p, [field]: val } : p))
    );
  };

  const handleRemovePlayer = (name: string) => {
    setEditPlayers((prev) => prev.filter((p) => p.name.toLowerCase() !== name.toLowerCase()));
  };

  const handleAddPlayer = () => {
    const trimmed = newPlayerName.trim();
    if (!trimmed) {
      toast.error("Player name cannot be empty.");
      return;
    }
    if (editPlayers.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Player is already in the game.");
      return;
    }
    setEditPlayers((prev) => [...prev, { name: trimmed, buyIn: 0, cashOut: 0, food: 0 }]);
    setNewPlayerName("");
  };

  const handleSaveEdit = async () => {
    if (editPlayers.length < 2) {
      toast.error("Roster must have at least 2 players.");
      return;
    }
    if (!isZeroSum) {
      toast.error("Total Buy-ins must equal Total Cash-outs.");
      return;
    }

    setIsSaving(true);
    try {
      const sb = createSupabaseBrowserClient();
      await updateGameAndPlayers(sb, gameId, {
        date: editData.date,
        duration: editData.duration,
        blinds: editData.blinds,
        location: editData.location,
        players: editPlayers,
      });
      // Local backup sync
      patchGame(gameId, {
        date: editData.date,
        duration: editData.duration,
        location: editData.location,
        blinds: editData.blinds,
        totalPot: totalBuyIn,
      });
      void recordAudit("game", gameId, "edit", {
        ...editData,
        players: editPlayers,
      });
      toast.success("Game details updated successfully!");
      setShowEditModal(false);
      router.refresh();
    } catch (err) {
      console.error("Failed to update game in database", err);
      toast.error("Failed to save changes. Make sure you are an admin and online.");
    } finally {
      setIsSaving(false);
    }
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
              onClick={handleOpenEdit}
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
            className="bg-[#0E1117] border border-white/10 rounded-2xl max-w-2xl w-full p-6 relative max-h-[90vh] overflow-y-auto"
          >
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute top-4 right-4 text-white/50 hover:text-white inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-black tracking-tight mb-4 uppercase pr-10">Edit Game</h2>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-1.5">
                  Date
                </label>
                <input
                  type="text"
                  value={editData.date}
                  onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
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
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
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
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
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
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                />
              </div>
            </div>

            {/* Players Table */}
            <div className="border-t border-white/10 pt-4 mb-4">
              <h3 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-3">Roster & Player Stats</h3>
              
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {editPlayers.map((p) => (
                  <div key={p.name} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 bg-white/5 border border-white/5 rounded-xl">
                    <div className="flex items-center gap-2 sm:w-1/3 min-w-0">
                      <PlayerAvatar name={p.name} size={28} className="rounded-full shrink-0" />
                      <span className="font-bold text-xs truncate text-white/90">{p.name}</span>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-1.5 flex-1">
                      <div>
                        <span className="block text-[9px] font-bold text-white/30 uppercase mb-0.5">Buy-in</span>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30 text-[10px]">£</span>
                          <input
                            type="number"
                            step="0.01"
                            value={p.buyIn === 0 ? "" : p.buyIn}
                            placeholder="0.00"
                            onChange={(e) => handlePlayerChange(p.name, "buyIn", parseFloat(e.target.value) || 0)}
                            className="w-full bg-black/30 border border-white/5 rounded-md pl-4 pr-1 py-1 text-base md:text-xs font-semibold text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <span className="block text-[9px] font-bold text-white/30 uppercase mb-0.5">Cash-out</span>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30 text-[10px]">£</span>
                          <input
                            type="number"
                            step="0.01"
                            value={p.cashOut === 0 ? "" : p.cashOut}
                            placeholder="0.00"
                            onChange={(e) => handlePlayerChange(p.name, "cashOut", parseFloat(e.target.value) || 0)}
                            className="w-full bg-black/30 border border-white/5 rounded-md pl-4 pr-1 py-1 text-base md:text-xs font-semibold text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <span className="block text-[9px] font-bold text-white/30 uppercase mb-0.5">Food</span>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30 text-[10px]">£</span>
                          <input
                            type="number"
                            step="0.01"
                            value={p.food === 0 ? "" : p.food}
                            placeholder="0.00"
                            onChange={(e) => handlePlayerChange(p.name, "food", parseFloat(e.target.value) || 0)}
                            className="w-full bg-black/30 border border-white/5 rounded-md pl-4 pr-1 py-1 text-base md:text-xs font-semibold text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => handleRemovePlayer(p.name)}
                      className="p-1.5 text-white/40 hover:text-red-400 hover:bg-white/5 rounded transition-colors self-end sm:self-center shrink-0"
                      title="Remove player"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
                {editPlayers.length === 0 && (
                  <p className="text-center text-xs text-white/40 py-4">No players in this session.</p>
                )}
              </div>
            </div>

            {/* Add Player Box */}
            <div className="bg-white/5 border border-dashed border-white/20 rounded-xl p-3 mb-4">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    list="available-players-list-edit"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    placeholder="Search or add player..."
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-base md:text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                  <datalist id="available-players-list-edit">
                    {allPlayersList
                      .filter((name) => !editPlayers.some((ep) => ep.name.toLowerCase() === name.toLowerCase()))
                      .map((name) => (
                        <option key={name} value={name} />
                      ))}
                  </datalist>
                </div>
                <button
                  type="button"
                  onClick={handleAddPlayer}
                  className="px-3 py-1.5 bg-cyan-400/20 hover:bg-cyan-400/30 border border-cyan-400/50 rounded-lg text-cyan-400 font-bold text-xs uppercase tracking-widest transition-colors shrink-0"
                >
                  Add Player
                </button>
              </div>
            </div>

            {/* Ledger Summary Check */}
            <div className="bg-black/50 border border-white/10 rounded-xl p-3 mb-4 text-xs space-y-1.5 font-semibold text-white/70">
              <div className="flex justify-between">
                <span>Total Buy-in:</span>
                <span className="tabular-nums font-bold text-white">£{totalBuyIn.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Cash-out:</span>
                <span className="tabular-nums font-bold text-white">£{totalCashOut.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-1 text-white/50">
                <span>Total Food:</span>
                <span className="tabular-nums font-bold text-yellow-400/90">£{totalFood.toFixed(2)}</span>
              </div>
              
              {!isZeroSum && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-red-400 text-[11px] leading-relaxed">
                  ⚠️ Total Buy-in does not equal Total Cash-out.
                  <br />
                  Buy-in: <span className="font-bold">£{totalBuyIn.toFixed(2)}</span> | Cash-out: <span className="font-bold">£{totalCashOut.toFixed(2)}</span>
                  <br />
                  Difference: <span className="font-bold">£{Math.abs(totalBuyIn - totalCashOut).toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6 shrink-0">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-bold uppercase text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving || !isZeroSum || editPlayers.length < 2}
                onClick={handleSaveEdit}
                className={`flex-1 px-4 py-2 rounded-lg font-bold uppercase text-sm transition-all border ${
                  isZeroSum && editPlayers.length >= 2 && !isSaving
                    ? "bg-[#39FF14]/25 hover:bg-[#39FF14]/35 border-[#39FF14]/50 text-[#39FF14]"
                    : "bg-white/5 border-white/5 text-white/30 cursor-not-allowed"
                }`}
              >
                {isSaving ? "Saving..." : "Save"}
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
