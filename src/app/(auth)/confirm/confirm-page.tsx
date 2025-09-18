"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

export default function ConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const code = searchParams.get("code");

    if (!code) {
      setStatus("error");
      setMessage("Kode verifikasi tidak ditemukan. Coba buka tautan dari email lagi.");
      return;
    }

    const verify = async () => {
      try {
        setStatus("verifying");

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) throw error;

        if (data?.session) {
          setStatus("success");
          setMessage("Email berhasil diverifikasi. Mengarahkan ke dashboard...");
          setTimeout(() => router.replace("/dashboard"), 1000);
        } else {
          setStatus("success");
          setMessage("Email berhasil diverifikasi. Silakan login untuk melanjutkan.");
        }
      } catch (err: unknown) {
        setStatus("error");
        const msg = err instanceof Error ? err.message : "Verifikasi gagal. Tautan tidak valid atau sudah kedaluwarsa.";
        setMessage(msg);
      }
    };

    verify();
  }, [searchParams, supabase, router]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-6 py-4 text-sm">
        <Link href="/" className="font-semibold text-xl text-yellow-500">Acadlabs</Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <section className="w-full max-w-md rounded-2xl border p-6">
          {status === "verifying" || status === "idle" ? (
            <div className="flex flex-col items-center text-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin" />
              <h1 className="text-lg font-semibold">Verifying...</h1>
              <p className="text-sm text-muted-foreground">Mohon tunggu, kami sedang memverifikasi email Anda.</p>
            </div>
          ) : null}

          {status === "success" ? (
            <div className="flex flex-col items-center text-center gap-3">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
              <h1 className="text-lg font-semibold">Email terverifikasi</h1>
              <p className="text-sm text-muted-foreground">{message}</p>
              <div className="mt-2">
                <Link href="/dashboard" className="text-sm underline">Lanjut ke Dashboard</Link>
              </div>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="flex flex-col items-center text-center gap-3">
              <TriangleAlert className="h-7 w-7 text-red-600" />
              <h1 className="text-lg font-semibold">Aduh Verifikasi Gagal cok!</h1>
              <p className="text-sm text-muted-foreground">{message}</p>
              <div className="mt-2 space-x-4">
                <Link href="/register" className="font-semibold text-blue-500">Daftar lagi</Link>
                <Link href="/login" className="font-semibold text-blue-500">Kembali ke Login</Link>
              </div>
            </div>
          ) : null}
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
