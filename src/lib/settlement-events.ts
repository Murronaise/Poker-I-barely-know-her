// Pub-sub for per-player settlement toggles. The settlement cards live in a
// server-rendered section; the "Settled" badge in HistoryActions lives in a
// separate client component. When you tick a player off, both need to react
// without a full page refresh — this event is how they stay in sync.

export const SETTLEMENT_TOGGLED_EVENT = "pt:settlement-toggled";

export type SettlementToggledDetail = {
  gameId: string;
  playerName: string;
  settled: boolean;
};

export function emitSettlementToggled(detail: SettlementToggledDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SETTLEMENT_TOGGLED_EVENT, { detail }));
}

export function onSettlementToggled(
  handler: (detail: SettlementToggledDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const wrapped = (e: Event) => handler((e as CustomEvent<SettlementToggledDetail>).detail);
  window.addEventListener(SETTLEMENT_TOGGLED_EVENT, wrapped);
  return () => window.removeEventListener(SETTLEMENT_TOGGLED_EVENT, wrapped);
}
