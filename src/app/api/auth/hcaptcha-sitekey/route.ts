import { NextResponse } from "next/server";

export async function GET() {
  const siteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || process.env.HCAPTCHA_SITE_KEY;
  if (!siteKey) {
    return NextResponse.json(
      { error: "HCAPTCHA site key is not configured" },
      { status: 500 }
    );
  }
  return NextResponse.json({ siteKey });
}
