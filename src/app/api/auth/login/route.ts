import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeEmail, isValidEmail } from "@/lib/sanitize";

// Simple in-memory rate limit (per-IP)
declare global {
  // eslint-disable-next-line no-var
  var __loginRateMap: Map<string, number[]> | undefined;
}
const rateMap: Map<string, number[]> = globalThis.__loginRateMap || new Map();
globalThis.__loginRateMap = rateMap;
const RATE_LIMIT = 10; // requests
const RATE_WINDOW_MS = 60_000; // 1 minute

export async function POST(request: NextRequest) {
  try {
    const { email, password, hcaptchaToken } = await request.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email dan password wajib diisi" },
        { status: 400 }
      );
    }

    // Sanitize and validate inputs
    const cleanEmail = sanitizeEmail(email);
    if (!isValidEmail(cleanEmail)) {
      return NextResponse.json(
        { error: "Email tidak valid" },
        { status: 400 }
      );
    }
    const passwordStr = typeof password === "string" ? password : String(password ?? "");
    const hToken = typeof hcaptchaToken === "string" ? hcaptchaToken.trim() : "";

    // Rate limit early
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const now = Date.now();
    const arr = rateMap.get(ip) || [];
    const recent = arr.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan. Coba lagi beberapa saat." },
        { status: 429 }
      );
    }
    recent.push(now);
    rateMap.set(ip, recent);

    // Verify hCaptcha
    const hcaptchaSecret = process.env.HCAPTCHA_SECRET_KEY;
    if (!hcaptchaSecret) {
      return NextResponse.json(
        { error: "Konfigurasi HCaptcha tidak ditemukan" },
        { status: 500 }
      );
    }
    if (!hToken) {
      return NextResponse.json(
        { error: "Captcha wajib diisi" },
        { status: 400 }
      );
    }
    const verifyRes = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: hcaptchaSecret,
        response: hToken,
      }),
    });
    const verifyJson = await verifyRes.json();
    if (!verifyJson?.success) {
      return NextResponse.json(
        { error: "Captcha verification failed" },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json(
        { error: "Konfigurasi Supabase tidak ditemukan" },
        { status: 500 }
      );
    }

    const supabase = createClient(url, anon);

    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: passwordStr });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        user: data.user,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
