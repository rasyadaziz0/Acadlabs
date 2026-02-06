"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createBrowserClient } from "@supabase/ssr";
import { Github } from "lucide-react";
import { validatePassword } from "@/lib/password-validator";
import Turnstile from "@/components/auth/Turnstile";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) router.replace("/dashboard");
    };
    check();
  }, [router, supabase]);

  // Fetch Turnstile site key
  useEffect(() => {
    const loadSiteKey = async () => {
      try {
        const res = await fetch("/api/auth/hcaptcha-sitekey");
        const json = await res.json();
        if (res.ok) {
          setSiteKey(json.siteKey);
        } else {
          setError(json?.error || "Captcha service unavailable");
        }
      } catch {
        setError("Failed to load captcha");
      }
    };
    loadSiteKey();
  }, []);



  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { valid, errors } = validatePassword(password);
      if (!valid) {
        setError(errors.join(" • "));
        setLoading(false);
        return;
      }
      if (!turnstileToken) {
        setError("Captcha wajib diisi");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, turnstileToken }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to register");
      }
      setInfo("Registration successful. Please check your email to verify your account.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred. Please try again.");
    } finally {
      setLoading(false);
      setTurnstileToken(null);
      window.turnstile?.reset();
    }
  };

  const signInWithProvider = async (provider: "google" | "github") => {
    setError(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-6 py-4 text-sm">
        <Link href="/" className="font-semibold text-xl text-yellow-500">Acadlabs</Link>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <section className="w-full max-w-md">
          <h1 className="text-center text-2xl font-semibold mb-6">Buat Akun</h1>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Email address"
              className="w-full h-12 rounded-full border border-input bg-background px-5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Password"
              className="w-full h-12 rounded-full border border-input bg-background px-5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="pt-1 flex justify-center">
              {siteKey && (
                <Turnstile
                  siteKey={siteKey}
                  onVerify={setTurnstileToken}
                  onError={() => setTurnstileToken(null)}
                  onExpire={() => setTurnstileToken(null)}
                />
              )}
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            {info && <p className="text-green-600 text-sm">{info}</p>}
            <button
              type="submit"
              disabled={loading || !turnstileToken}
              className="w-full h-12 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? "Processing..." : "Masuk"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Punya Akun? <Link href="/login" className="font-semibold text-blue-500">Login Aja</Link>
          </p>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => signInWithProvider("google")}
              disabled={loading}
              className="w-full h-11 rounded-full border flex items-center justify-center gap-2 hover:bg-muted transition"
            >
              <Image src="https://cdn1.iconfinder.com/data/icons/google-s-logo/150/Google_Icons-09-512.png" width={20} height={20} alt="Google" unoptimized />
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => signInWithProvider("github")}
              disabled={loading}
              className="w-full h-11 rounded-full border flex items-center justify-center gap-2 hover:bg-muted transition"
            >
              <Github className="h-4 w-4" />
              Continue with GitHub
            </button>
          </div>
        </section>
      </main>
      <footer className="py-10 text-center text-xs text-muted-foreground">
        <a href="#" className="hover:underline">Terms of Use</a>
        <span className="mx-2">|</span>
        <a href="#" className="hover:underline">Privacy Policy</a>
      </footer>
    </div>
  );
}
