"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ChevronLeft, CheckCircle } from "lucide-react";
import { validatePassword } from "@/lib/validation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  // Supabase parses the recovery token from the URL hash and emits a
  // PASSWORD_RECOVERY event when the user lands here. Until that fires we
  // don't know whether the link is valid.
  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setTokenValid(true);
      }
    });

    // Fallback — if there's already a session (e.g. user refreshed the page
    // mid-flow), allow them to proceed.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setTokenValid(true);
      else if (tokenValid === null) setTokenValid(false);
    });

    return () => subscription.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || "Could not update password.");
        setLoading(false);
        return;
      }

      // Sign out so they log in fresh with the new password. Await before
      // showing the success state so a slow signOut can't race the redirect
      // (previously the 2s timeout sometimes fired with the old session
      // still active).
      await supabase.auth.signOut();
      setDone(true);
      setLoading(false);
      setTimeout(() => router.push("/login?message=Password+updated.+Please+log+in."), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.05)_0%,_rgba(14,17,23,1)_60%)] text-[#FAFAFA] px-4 py-5">
      <Link
        href="/login"
        className="absolute top-6 left-4 inline-flex items-center gap-2 text-base text-white/50 hover:text-[#39FF14] font-semibold transition-colors"
      >
        <ChevronLeft size={18} />
        <span>Back to Login</span>
      </Link>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight uppercase leading-none mb-2">
            New Password
          </h1>
          <p className="text-white/50 text-base">Choose a strong new password</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8">
          {tokenValid === false ? (
            <div className="space-y-4 text-center">
              <p className="text-white/70 text-sm">
                This reset link is invalid or has expired. Request a new one.
              </p>
              <Link
                href="/forgot-password"
                className="block w-full text-center bg-[#39FF14]/20 hover:bg-[#39FF14]/30 border border-[#39FF14]/50 text-[#39FF14] font-black uppercase text-sm py-3 rounded-lg transition-colors mt-4"
              >
                Request New Link
              </Link>
            </div>
          ) : done ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center justify-center">
                <CheckCircle className="text-[#39FF14]" size={28} />
              </div>
              <p className="text-white/70 text-sm">
                Password updated. Redirecting to login…
              </p>
            </div>
          ) : tokenValid === null ? (
            <div className="text-center text-white/50 text-sm py-6">Validating link…</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                  New Password
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
              </div>

              <div>
                <label className="block text-xs font-bold text-white/50 uppercase mb-2 tracking-widest">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                  required
                  autoComplete="new-password"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-colors"
                  placeholder="Type it again"
                />
              </div>

              {error && (
                <div className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3">
                  <p className="text-sm font-semibold text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#39FF14]/20 hover:bg-[#39FF14]/30 border border-[#39FF14]/50 text-[#39FF14] font-black uppercase text-sm py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
