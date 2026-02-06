import { NextResponse } from "next/server";

export async function GET() {
  const siteKey = process.env.CLOUDFLARE_SITE_KEY;
  if (!siteKey) {
    return NextResponse.json({ error: "Site key not configured" }, { status: 500 });
  }
  return NextResponse.json({ siteKey });
}
