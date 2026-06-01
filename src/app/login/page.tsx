"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ChevronLeft, CheckCircle } from "lucide-react";
import { markFreshLogin } from "@/components/PollLoginPrompt";

// Map Supabase's terse error strings into something the user can act on.
// Anything we don't recognise falls back to the original message.
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Email or password doesn't match our records.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email first — check your inbox for the link.";
  }
  if (lower.includes("rate limit")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  return message;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createSupabaseBrowserClient();

  const success = searchParams.get("message")
    ? decodeURIComponent(searchParams.get("message") || "")
    : "";

  // If a logged-in user lands here, send them home rather than show a form
  // they don't need.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.replace("/");
      } else {
        setAuthChecked(true);
      }
    });
  }, [supabase, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(friendlyAuthError(authError.message || "Login failed."));
        setLoading(false);
        return;
      }

      if (!data.session) {
        setError("No session returned. Please try again.");
        setLoading(false);
        return;
      }

      // Tell the global poll prompt to check for an unresponded poll on
      // the next page load. Consumed exactly once.
      markFreshLogin();

      // `replace` (not `push`) so the login page isn't in history, and skip
      // the manual `refresh()` — the Supabase auth listener already triggers
      // a re-render of server-component data on cookie change, and the
      // extra refresh occasionally double-renders the dashboard.
      router.replace("/");
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
            Login
          </h1>
          <p className="text-white/50 text-base">Sign in to RSVP and track your sessions</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8">
          {success && (
            <div className="bg-[#39FF14]/10 border border-[#39FF14]/30 rounded-lg px-4 py-3 mb-4 flex items-start gap-3">
              <CheckCircle size={18} className="text-[#39FF14] mt-0.5 shrink-0" />
              <p className="text-sm font-semibold text-[#39FF14]">{success}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4" noValidate>
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
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "login-error" : undefined}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-white/50 uppercase tracking-widest">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-[#39FF14]/80 hover:text-[#39FF14] transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                required
                autoComplete="current-password"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "login-error" : undefined}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div id="login-error" role="alert" aria-live="polite" className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3">
                <p className="text-sm font-semibold text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#39FF14]/20 hover:bg-[#39FF14]/30 border border-[#39FF14]/50 text-[#39FF14] font-black uppercase text-sm py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>

        <p className="text-center text-white/60 text-sm mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-[#39FF14] hover:text-[#39FF14]/80 font-semibold">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
