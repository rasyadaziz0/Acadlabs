import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeEmail, isValidEmail } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const { email, password, turnstileToken } = await request.json();
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
    const tToken = typeof turnstileToken === "string" ? turnstileToken.trim() : "";

    // Rate limit early
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const { success } = await rateLimit(`auth-login:${ip}`);
    if (!success) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan. Coba lagi beberapa saat." },
        { status: 429 }
      );
    }

    // Verify Turnstile
    const turnstileSecret = process.env.CLOUDFLARE_SECRET_KEY;
    if (!turnstileSecret) {
      return NextResponse.json(
        { error: "Konfigurasi Turnstile tidak ditemukan" },
        { status: 500 }
      );
    }
    if (!tToken) {
      return NextResponse.json(
        { error: "Captcha wajib diisi" },
        { status: 400 }
      );
    }
    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: turnstileSecret,
        response: tToken,
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
