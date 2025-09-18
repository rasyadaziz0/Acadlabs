import { NextRequest, NextResponse } from "next/server";
import { handleFileUpload } from "@/lib/file-processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
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
  } catch (error: any) {
    const message = error?.message || "Gagal memproses file";
    return NextResponse.json(
      { ok: false, error: message, details: error },
      { status: 500 }
    );
  }
}
