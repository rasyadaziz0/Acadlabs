import { NextRequest, NextResponse } from "next/server";
import { handleFileUpload } from "@/lib/file-processing";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";
import { hasPersistentRateLimitBackend, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".pdf": ["application/pdf"],
};

function getFileExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx).toLowerCase();
}

async function hasValidMagicBytes(file: File, ext: string): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (ext === ".png") {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return png.every((b, i) => header[i] === b);
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  }
  if (ext === ".pdf") {
    const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
    return pdf.every((b, i) => header[i] === b);
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPersistentRateLimitBackend()) {
      return NextResponse.json(
        { ok: false, error: "Rate limiter backend belum dikonfigurasi" },
        { status: 503 }
      );
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const { success } = await rateLimit(`upload:${user.id}:${ip}`);
    if (!success) {
      return NextResponse.json(
        { ok: false, error: "Terlalu banyak upload. Coba lagi beberapa saat." },
        { status: 429 }
      );
    }

    const form = await req.formData();
    const file = (form.get("file") || form.get("image")) as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No file provided. Kirim field 'file' atau 'image'" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { ok: false, error: `Ukuran file maksimal ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB` },
        { status: 413 }
      );
    }

    const ext = getFileExtension(file.name || "");
    const allowedMimes = ALLOWED_FILE_TYPES[ext];
    const mimeType = (file.type || "").toLowerCase();
    if (!allowedMimes || !allowedMimes.includes(mimeType)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Tipe file tidak diizinkan. Hanya PNG, JPG/JPEG, dan PDF.",
        },
        { status: 415 }
      );
    }
    const hasExpectedSignature = await hasValidMagicBytes(file, ext);
    if (!hasExpectedSignature) {
      return NextResponse.json(
        { ok: false, error: "Konten file tidak cocok dengan tipe file yang diizinkan." },
        { status: 415 }
      );
    }

    const result = await handleFileUpload(file);

    return NextResponse.json({
      ok: true,
      result,
      meta: {
        name: file.name,
        mimeType: file.type || "",
        size: file.size,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal memproses file";
    return NextResponse.json(
      { ok: false, error: message, details: error },
      { status: 500 }
    );
  }
}
