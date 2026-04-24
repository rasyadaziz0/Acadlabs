import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";
import { hasPersistentRateLimitBackend, rateLimit } from "@/lib/rate-limit";

// Konfigurasi untuk menangani permintaan dengan ukuran lebih besar
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const JUDGE0_API_URL = "https://judge0-ce.p.rapidapi.com/submissions";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPersistentRateLimitBackend()) {
      return NextResponse.json(
        { error: "Rate limiter backend belum dikonfigurasi" },
        { status: 503 }
      );
    }
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const { success } = await rateLimit(`run-code:${user.id}:${ip}`);
    if (!success) {
      return NextResponse.json(
        { error: "Terlalu banyak request. Coba lagi beberapa saat." },
        { status: 429 }
      );
    }

    const { source_code, language_id } = await request.json();

    // Validasi input
    if (!source_code || !language_id) {
      return NextResponse.json(
        { error: "Source code and language ID are required" },
        { status: 400 }
      );
    }

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey || rapidApiKey.trim().length === 0) {
      console.error("run-code config error: RAPIDAPI_KEY missing");
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    console.info("usage:run-code", { userId: user.id, languageId: language_id });

    // Kirim kode ke Judge0 API
    const response = await fetch(`${JUDGE0_API_URL}?base64_encoded=false&wait=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RapidAPI-Key": rapidApiKey,
        "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
      },
      body: JSON.stringify({
        source_code,
        language_id,
        stdin: "",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Judge0 API error", { status: response.status, body: errorText });
      return NextResponse.json(
        { error: "Failed to execute code" },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      status: result.status || {},
      compile_output: result.compile_output || "",
      message: result.message || "",
      time: result.time || "",
      memory: result.memory || "",
    });
  } catch (error) {
    console.error("Error in run-code API:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
