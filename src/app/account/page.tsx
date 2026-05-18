"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, UserCircle, Save, LogOut, Lock, ChevronRight, BadgeCheck, Wallet } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validatePlayerName, validatePassword, PLAYER_NAME_MAX } from "@/lib/validation";
import { emitProfileUpdated } from "@/lib/profile-events";
import { profileSlug } from "@/lib/registered-players";
import { historicalGames } from "@/lib/historical-games";
import PlayerAvatar from "@/components/PlayerAvatar";
import { normaliseHandle, PROVIDER_LABEL, type PaymentHandles } from "@/lib/payment-links";

type AccountUser = {
  id: string;
  email: string;
  created_at?: string;
};

export default function AccountPage() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // Payment handles — used by the history page to render tap-to-pay
  // deep-links next to each settlement row. Stored without a URL prefix or
  // @ sign; normaliseHandle() strips both on input.
  const [revolutHandle, setRevolutHandle] = useState("");
  const [monzoHandle, setMonzoHandle] = useState("");
  const [paypalHandle, setPaypalHandle] = useState("");
  const [pmSaving, setPmSaving] = useState(false);
  const [pmError, setPmError] = useState("");
  const [pmSuccess, setPmSuccess] = useState("");

  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user || !data.user.email) {
          router.push("/login");
          return;
        }

        setUser({
          id: data.user.id,
          email: data.user.email,
          created_at: data.user.created_at,
        });

        const { data: userProfile, error } = await supabase
          .from("users")
          .select("player_name, revolut_handle, monzo_handle, paypal_handle")
          .eq("email", data.user.email)
          .single();

        if (error && error.code === "PGRST116") {
          // No profile row — usually means the auth.users → users trigger
          // hasn't been installed, or this account predates it. Self-heal by
          // creating one with a name derived from the email.
          const fallbackName = data.user.email.split("@")[0] || "Player";
          await supabase.from("users").insert({
            user_id: data.user.id,
            email: data.user.email,
            player_name: fallbackName,
            is_admin: false,
          });
          setPlayerName(fallbackName);
          setOriginalName(fallbackName);
        } else if (!error && userProfile?.player_name) {
          setPlayerName(userProfile.player_name);
          setOriginalName(userProfile.player_name);
          // Pre-fill payment handles if they're set. We tolerate the columns
          // being missing — that's the state before the Phase A migration is
          // applied, in which case `select(...)` returns undefined keys.
          setRevolutHandle((userProfile as { revolut_handle?: string | null }).revolut_handle ?? "");
          setMonzoHandle((userProfile as { monzo_handle?: string | null }).monzo_handle ?? "");
          setPaypalHandle((userProfile as { paypal_handle?: string | null }).paypal_handle ?? "");
        }

        // Pull the avatar from the players table (separate from users — this
        // is shared with the historical-game roster).
        const nameForAvatar = (userProfile?.player_name as string | undefined) ?? null;
        if (nameForAvatar) {
          const { data: playerRow } = await supabase
            .from("players")
            .select("avatar_url")
            .ilike("name", nameForAvatar)
            .maybeSingle();
          setAvatarUrl(playerRow?.avatar_url ?? null);
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [supabase, router]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setProfileError("");
    setProfileSuccess("");

    const trimmedName = playerName.trim();
    const nameError = validatePlayerName(trimmedName);
    if (nameError) {
      setProfileError(nameError);
      return;
    }

    if (trimmedName === originalName) {
      setProfileSuccess("No changes to save.");
      setTimeout(() => setProfileSuccess(""), 2000);
      return;
    }

    setSaving(true);
    try {
      // Pre-check uniqueness, excluding the current user.
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .ilike("player_name", trimmedName)
        .neq("email", user.email)
        .maybeSingle();

      if (existing) {
        setProfileError("This player name is already taken. Please choose a different name.");
        setSaving(false);
        return;
      }

      const { error: updateError } = await supabase
        .from("users")
        .update({ player_name: trimmedName, updated_at: new Date().toISOString() })
        .eq("email", user.email);

      if (updateError) {
        setProfileError(updateError.message || "Failed to update profile.");
        setSaving(false);
        return;
      }

      setOriginalName(trimmedName);
      setPlayerName(trimmedName);
      setProfileSuccess("Profile updated.");
      emitProfileUpdated();
      setTimeout(() => setProfileSuccess(""), 3000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setPwError("");
    setPwSuccess("");

    if (!currentPassword) {
      setPwError("Enter your current password to confirm.");
      return;
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setPwError(passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New passwords don't match.");
      return;
    }
    if (newPassword === currentPassword) {
      setPwError("New password must be different from your current one.");
      return;
    }

    setPwSaving(true);
    try {
      // Re-verify by signing in with the current password — Supabase doesn't
      // require this for updateUser, but it's the only sane UX guard against
      // someone with a hijacked session changing the password.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (verifyError) {
        setPwError("Current password is incorrect.");
        setPwSaving(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setPwError(updateError.message || "Failed to update password.");
        setPwSaving(false);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwSuccess("Password updated.");
      setTimeout(() => setPwSuccess(""), 3000);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPwSaving(false);
    }
  };

  // Validate each non-empty handle, then UPDATE the columns. We deliberately
  // write back the *normalised* value (no @ prefix, no URL) so the row
  // converges on a clean canonical form even when the user pastes a full
  // revolut.me link.
  const handleSavePaymentHandles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setPmError("");
    setPmSuccess("");

    const toCheck: { value: string; label: string }[] = [
      { value: revolutHandle, label: PROVIDER_LABEL.revolut },
      { value: monzoHandle, label: PROVIDER_LABEL.monzo },
      { value: paypalHandle, label: PROVIDER_LABEL.paypal },
    ];
    for (const f of toCheck) {
      if (!f.value.trim()) continue;
      if (normaliseHandle(f.value) === null) {
        setPmError(`${f.label} handle looks invalid — letters, numbers, dots, dashes, and underscores only.`);
        return;
      }
    }

    setPmSaving(true);
    try {
      const update: Partial<PaymentHandles> & { updated_at: string } = {
        revolut: revolutHandle.trim() ? normaliseHandle(revolutHandle) : null,
        monzo: monzoHandle.trim() ? normaliseHandle(monzoHandle) : null,
        paypal: paypalHandle.trim() ? normaliseHandle(paypalHandle) : null,
        updated_at: new Date().toISOString(),
      };
      // The DB columns are snake_case; the in-memory shape is camelCase.
      const { error } = await supabase
        .from("users")
        .update({
          revolut_handle: update.revolut,
          monzo_handle: update.monzo,
          paypal_handle: update.paypal,
          updated_at: update.updated_at,
        })
        .eq("email", user.email);
      if (error) {
        // The most likely failure is the migration not being applied yet —
        // surface that hint specifically so the user knows why.
        const msg = error.message || "Couldn't save payment handles.";
        const looksLikeMissingColumn = /column .* does not exist/i.test(msg);
        setPmError(
          looksLikeMissingColumn
            ? "Payment columns aren't set up yet — run the Phase A migration in Supabase, then try again."
            : msg,
        );
        return;
      }
      setRevolutHandle(update.revolut ?? "");
      setMonzoHandle(update.monzo ?? "");
      setPaypalHandle(update.paypal ?? "");
      setPmSuccess("Payment handles saved.");
      setTimeout(() => setPmSuccess(""), 3000);
    } catch (err) {
      setPmError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPmSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    emitProfileUpdated();
    router.push("/");
    router.refresh();
  };

  if (loading) {
    return <AccountSkeleton />;
  }

  if (!user) return null;

  // Count historical sessions where the player's name matches (case-insensitive).
  // The match is implicit: their player_name IS their profile.
  const lowerName = (originalName || playerName).toLowerCase();
  const sessionCount = lowerName
    ? historicalGames.filter((g) =>
        g.players.some((p) => p.name.toLowerCase() === lowerName),
      ).length
    : 0;
  const profileHref = lowerName ? `/profile/${profileSlug(originalName || playerName)}` : null;

  return (
    <main className="flex-1 flex flex-col md:min-h-0 md:overflow-auto bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors mb-6 w-fit"
      >
        <ChevronLeft size={18} />
        <span>Back to Dashboard</span>
      </Link>

      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 bg-[#39FF14]/10 rounded-xl border border-[#39FF14]/20">
            <UserCircle className="text-[#39FF14]" size={22} />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight uppercase leading-none">
              Account Settings
            </h1>
            <p className="text-white/50 text-base mt-2">Manage your profile and password</p>
          </div>
        </div>

        {/* Your Profile — links the auth account to the historical player
            profile by name match. Encourages users to claim their stats. */}
        {profileHref && (
          <Link
            href={profileHref}
            className="block bg-white/5 backdrop-blur-xl border border-[#39FF14]/30 hover:border-[#39FF14]/60 rounded-2xl p-4 md:p-5 mb-6 group transition-colors"
          >
            <div className="flex items-center gap-4">
              <PlayerAvatar
                name={originalName || playerName}
                avatarUrl={avatarUrl}
                size={56}
                className="rounded-full border-2 border-[#39FF14]/40 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/30 rounded px-1.5 py-0.5">
                    <BadgeCheck size={10} />
                    Verified
                  </span>
                </div>
                <p className="text-lg md:text-xl font-black tracking-tight group-hover:text-[#39FF14] transition-colors truncate">
                  {originalName || playerName}
                </p>
                <p className="text-sm text-white/50">
                  {sessionCount > 0
                    ? `${sessionCount} session${sessionCount === 1 ? "" : "s"} on record`
                    : "No history yet — your stats will appear after your first session"}
                </p>
              </div>
              <ChevronRight size={18} className="text-white/40 group-hover:text-[#39FF14] transition-colors shrink-0" />
            </div>
          </Link>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Profile */}
          <form
            onSubmit={handleSaveProfile}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex flex-col"
            noValidate
          >
            <h2 className="text-lg font-black uppercase mb-6">Profile</h2>

            <div className="space-y-4 flex-1">
              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                  Player Name
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => { setPlayerName(e.target.value); setProfileError(""); }}
                  maxLength={PLAYER_NAME_MAX}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                  Email
                </label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white/50 cursor-not-allowed"
                />
                <p className="text-xs text-white/60 mt-2">Email cannot be changed</p>
              </div>

              {profileError && (
                <div role="alert" aria-live="polite" className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3">
                  <p className="text-sm font-semibold text-red-400">{profileError}</p>
                </div>
              )}

              {profileSuccess && (
                <div className="bg-[#39FF14]/10 border border-[#39FF14]/30 rounded-lg px-4 py-3">
                  <p className="text-sm font-semibold text-[#39FF14]">{profileSuccess}</p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-[#39FF14]/20 hover:bg-[#39FF14]/30 border border-[#39FF14]/50 text-[#39FF14] font-black uppercase text-sm py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>

          {/* Password */}
          <form
            onSubmit={handleChangePassword}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex flex-col"
            noValidate
          >
            <h2 className="text-lg font-black uppercase mb-6">Change Password</h2>

            <div className="space-y-4 flex-1">
              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setPwError(""); }}
                  autoComplete="current-password"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPwError(""); }}
                  autoComplete="new-password"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPwError(""); }}
                  autoComplete="new-password"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-colors"
                />
              </div>

              {pwError && (
                <div role="alert" aria-live="polite" className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3">
                  <p className="text-sm font-semibold text-red-400">{pwError}</p>
                </div>
              )}

              {pwSuccess && (
                <div className="bg-[#39FF14]/10 border border-[#39FF14]/30 rounded-lg px-4 py-3">
                  <p className="text-sm font-semibold text-[#39FF14]">{pwSuccess}</p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={pwSaving}
              className="w-full bg-cyan-400/20 hover:bg-cyan-400/30 border border-cyan-400/50 text-cyan-400 font-black uppercase text-sm py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
            >
              <Lock size={16} />
              {pwSaving ? "Updating..." : "Update Password"}
            </button>
          </form>
        </div>

        {/* Payment handles — drives the one-tap pay buttons on each
            settlement row. All three providers are optional; the buttons
            only render for the ones we've got. */}
        <form
          onSubmit={handleSavePaymentHandles}
          className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mt-6 flex flex-col"
          noValidate
        >
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={18} className="text-[#39FF14]" />
            <h2 className="text-lg font-black uppercase">Payment handles</h2>
          </div>
          <p className="text-xs text-white/40 mb-5">
            Settlement rows show a tap-to-pay button for each handle you fill in.
            Paste your username or the full link — we&apos;ll clean it up.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                Revolut
              </label>
              <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 focus-within:border-[#39FF14] focus-within:ring-1 focus-within:ring-[#39FF14]/50 transition-colors">
                <span className="text-white/30 text-sm shrink-0">revolut.me/</span>
                <input
                  type="text"
                  value={revolutHandle}
                  onChange={(e) => { setRevolutHandle(e.target.value); setPmError(""); }}
                  placeholder="handle"
                  maxLength={64}
                  autoComplete="off"
                  className="flex-1 bg-transparent text-white placeholder-white/30 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                Monzo
              </label>
              <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 focus-within:border-[#39FF14] focus-within:ring-1 focus-within:ring-[#39FF14]/50 transition-colors">
                <span className="text-white/30 text-sm shrink-0">monzo.me/</span>
                <input
                  type="text"
                  value={monzoHandle}
                  onChange={(e) => { setMonzoHandle(e.target.value); setPmError(""); }}
                  placeholder="handle"
                  maxLength={64}
                  autoComplete="off"
                  className="flex-1 bg-transparent text-white placeholder-white/30 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                PayPal
              </label>
              <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 focus-within:border-[#39FF14] focus-within:ring-1 focus-within:ring-[#39FF14]/50 transition-colors">
                <span className="text-white/30 text-sm shrink-0">paypal.me/</span>
                <input
                  type="text"
                  value={paypalHandle}
                  onChange={(e) => { setPaypalHandle(e.target.value); setPmError(""); }}
                  placeholder="handle"
                  maxLength={64}
                  autoComplete="off"
                  className="flex-1 bg-transparent text-white placeholder-white/30 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {pmError && (
            <div role="alert" aria-live="polite" className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3 mt-4">
              <p className="text-sm font-semibold text-red-400">{pmError}</p>
            </div>
          )}
          {pmSuccess && (
            <div className="bg-[#39FF14]/10 border border-[#39FF14]/30 rounded-lg px-4 py-3 mt-4">
              <p className="text-sm font-semibold text-[#39FF14]">{pmSuccess}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={pmSaving}
            className="w-full sm:w-auto sm:self-start bg-[#39FF14]/20 hover:bg-[#39FF14]/30 border border-[#39FF14]/50 text-[#39FF14] font-black uppercase text-sm py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
          >
            <Save size={16} />
            {pmSaving ? "Saving..." : "Save Payment Handles"}
          </button>
        </form>

        {/* Session info + logout */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mt-6">
          <h2 className="text-lg font-black uppercase mb-6">Session</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Status</p>
              <div className="bg-black/40 border border-white/10 rounded-lg px-4 py-3">
                <span className="text-[#39FF14] font-bold">Active</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Member Since</p>
              <div className="bg-black/40 border border-white/10 rounded-lg px-4 py-3">
                <span className="text-white/70 font-semibold">
                  {new Date(user.created_at || Date.now()).toLocaleDateString("en-US", {
                    year: "numeric", month: "long", day: "numeric",
                  })}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 font-black uppercase text-sm py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function AccountSkeleton() {
  return (
    <main className="flex-1 flex flex-col bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 md:px-6 xl:px-12 py-5 animate-pulse">
      <div className="h-5 w-40 bg-white/10 rounded mb-6" />
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 bg-white/10 rounded-xl" />
          <div className="flex-1">
            <div className="h-8 w-64 bg-white/10 rounded mb-2" />
            <div className="h-4 w-80 bg-white/5 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 h-80">
              <div className="h-5 w-32 bg-white/10 rounded mb-6" />
              <div className="space-y-4">
                <div className="h-12 bg-white/5 rounded-lg" />
                <div className="h-12 bg-white/5 rounded-lg" />
                <div className="h-12 bg-white/5 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
