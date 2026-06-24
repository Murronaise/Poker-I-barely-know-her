"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ChevronLeft, CheckCircle, BadgeCheck, Info } from "lucide-react";
import {
  validateEmail,
  validatePassword,
  validatePlayerName,
  PLAYER_NAME_MAX,
} from "@/lib/validation";
import { type HistoricalGame } from "@/lib/historical-games";
import { getEffectiveHistoricalGames, fetchEffectiveGames } from "@/lib/game-store";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [error, setError] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  // Dynamic state for effective games (initialized to sync local overlays + seed)
  const [games, setGames] = useState<HistoricalGame[]>(() => getEffectiveHistoricalGames());

  // Load latest effective games asynchronously on mount
  useEffect(() => {
    let cancelled = false;
    fetchEffectiveGames(supabase).then((res) => {
      if (!cancelled) setGames(res);
    });
    return () => { cancelled = true; };
  }, [supabase]);

  // Pre-compute the set of player names that show up in historical games so
  // we can tell the user "we found X sessions for that name" before they
  // commit to the signup.
  const historicalPlayerNames = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) {
      for (const p of g.players) set.add(p.name.toLowerCase());
    }
    return set;
  }, [games]);

  const trimmedName = playerName.trim();
  const historicalSessions = useMemo(() => {
    if (!trimmedName) return 0;
    const lower = trimmedName.toLowerCase();
    return games.filter((g) =>
      g.players.some((p) => p.name.toLowerCase() === lower),
    ).length;
  }, [trimmedName, games]);
  const nameHasHistory = trimmedName.length >= 2 && historicalPlayerNames.has(trimmedName.toLowerCase());

  // If a logged-in user lands here, send them home — signup makes no sense.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.replace("/");
      } else {
        setAuthChecked(true);
      }
    });
  }, [supabase, router]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const trimmedName = playerName.trim();

      const nameError = validatePlayerName(trimmedName);
      if (nameError) {
        setError(nameError);
        setLoading(false);
        return;
      }

      const emailError = validateEmail(email);
      if (emailError) {
        setError(emailError);
        setLoading(false);
        return;
      }

      const passwordError = validatePassword(password);
      if (passwordError) {
        setError(passwordError);
        setLoading(false);
        return;
      }

      // Pre-check name uniqueness so we don't create an auth user only to
      // discover the name is taken. (A DB unique constraint is the real
      // guarantee — this just avoids the wasted signup in the common case.)
      const { data: existingPlayer } = await supabase
        .from("users")
        .select("id")
        .ilike("player_name", trimmedName)
        .maybeSingle();

      if (existingPlayer) {
        setError("This player name is already taken. Please choose a different name.");
        setLoading(false);
        return;
      }

      // The DB trigger on auth.users will create the matching row in `users`
      // using player_name from raw_user_meta_data, so signup is atomic — no
      // orphan auth users on profile-insert failure.
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            player_name: trimmedName,
          },
        },
      });

      if (signupError) {
        // The pre-check can lose a race against another concurrent signup;
        // in that case Postgres throws a unique-constraint error that
        // Supabase surfaces as "duplicate key value" / 23505. Translate it
        // into something the user can act on.
        const raw = signupError.message ?? "";
        const isDuplicateName =
          raw.toLowerCase().includes("duplicate") &&
          raw.toLowerCase().includes("player_name");
        setError(
          isDuplicateName
            ? "That name was just taken by someone else — please pick a different one."
            : raw || "Signup failed. Please try again.",
        );
        setLoading(false);
        return;
      }

      if (!data.user) {
        setError("Failed to create account. Please try again.");
        setLoading(false);
        return;
      }

      // Supabase returns no session when email confirmation is required.
      // Show the "check your inbox" view rather than dropping the user at a
      // login page that would just reject them.
      if (!data.session) {
        setConfirmationSent(true);
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "An error occurred. Please try again.";
      setError(errorMsg);
      setLoading(false);
    }
  };

  if (!authChecked) {
    return (
      <main className="flex-1 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA]">
        <div className="text-white/40 text-sm tracking-widest uppercase">Loading…</div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 py-5">
      <Link
        href="/"
        className="absolute top-6 left-4 inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors"
      >
        <ChevronLeft size={18} />
        <span>Back to Dashboard</span>
      </Link>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight uppercase leading-none mb-2">
            {confirmationSent ? "Check your email" : "Create Account"}
          </h1>
          <p className="text-white/50 text-base">
            {confirmationSent
              ? "We sent you a confirmation link"
              : "Join the game and track your sessions"}
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8">
          {confirmationSent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center justify-center">
                <CheckCircle className="text-[#39FF14]" size={28} />
              </div>
              <p className="text-white/70 text-sm">
                We&apos;ve sent a confirmation link to <span className="font-bold text-white">{email}</span>. Click the link to activate your account, then log in.
              </p>
              <Link
                href="/login"
                className="block w-full text-center bg-[#39FF14]/20 hover:bg-[#39FF14]/30 border border-[#39FF14]/50 text-[#39FF14] font-black uppercase text-sm py-3 rounded-lg transition-colors mt-4"
              >
                Go to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4" noValidate>
              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                  Player Name
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => { setPlayerName(e.target.value); setError(""); }}
                  required
                  maxLength={PLAYER_NAME_MAX}
                  autoComplete="username"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-colors"
                  placeholder="Your player name"
                />
                {trimmedName.length >= 2 && (
                  nameHasHistory ? (
                    <p className="mt-2 text-xs text-[#39FF14] flex items-center gap-1.5">
                      <BadgeCheck size={12} />
                      Found {historicalSessions} session{historicalSessions === 1 ? "" : "s"} for &ldquo;{trimmedName}&rdquo; — your stats will link automatically.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-white/40 flex items-center gap-1.5">
                      <Info size={12} />
                      No history found for this name yet. Your stats will appear after your first session.
                    </p>
                  )
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  required
                  autoComplete="email"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  required
                  autoComplete="new-password"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-colors"
                  placeholder="At least 8 chars, with a number"
                />
                <p className="text-xs text-white/30 mt-2">Min 8 characters with at least one letter and number</p>
              </div>

              {error && (
                <div role="alert" aria-live="polite" className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3">
                  <p className="text-sm font-semibold text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#39FF14]/20 hover:bg-[#39FF14]/30 border border-[#39FF14]/50 text-[#39FF14] font-black uppercase text-sm py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              >
                {loading ? "Creating Account..." : "Create Account"}
              </button>
            </form>
          )}

          {!confirmationSent && (
            <div className="mt-6 pt-6 border-t border-white/10">
              <p className="text-center text-white/60 text-sm">
                Already have an account?{" "}
                <Link href="/login" className="text-[#39FF14] hover:text-[#39FF14]/80 font-semibold">
                  Log in
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
