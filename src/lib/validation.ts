// Shared validation rules for auth forms — keeps signup, login, account, and
// password reset in agreement so users see the same error wording wherever
// they end up.

export const PLAYER_NAME_MIN = 2;
export const PLAYER_NAME_MAX = 24;
export const PASSWORD_MIN = 8;

const PLAYER_NAME_REGEX = /^[A-Za-z0-9 _-]+$/;

export function validatePlayerName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < PLAYER_NAME_MIN) {
    return `Player name must be at least ${PLAYER_NAME_MIN} characters.`;
  }
  if (name.length > PLAYER_NAME_MAX) {
    return `Player name must be ${PLAYER_NAME_MAX} characters or fewer.`;
  }
  if (!PLAYER_NAME_REGEX.test(name)) {
    return "Player name can only contain letters, numbers, spaces, hyphens, and underscores.";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Email is required.";
  // Cheap sanity check — Supabase will do the authoritative validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Please enter a valid email address.";
  }
  return null;
}
