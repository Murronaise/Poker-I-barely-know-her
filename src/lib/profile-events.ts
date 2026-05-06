// Tiny pub-sub so the NavBar can react when the user updates their player
// name on the account page, without a hard reload. Event name kept on a
// constant so typos don't silently break the link.

export const PROFILE_UPDATED_EVENT = "pt:profile-updated";

export function emitProfileUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
}

export function onProfileUpdated(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PROFILE_UPDATED_EVENT, handler);
  return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handler);
}
