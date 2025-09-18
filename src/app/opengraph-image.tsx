import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";
export const alt = "Acadlabs – AI Chat Assistant Bahasa Indonesia";
export const runtime = "edge";

export default async function Image() {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://acadlabs.fun").replace(/^https?:\/\//, "");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0B0F1A 0%, #111827 100%)",
          color: "#fff",
          padding: "72px",
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>Acadlabs</div>
        <div style={{ marginTop: 16, fontSize: 32, opacity: 0.9 }}>
          AI Chat Assistant Bahasa Indonesia
        </div>
        <div style={{ marginTop: "auto", fontSize: 24, opacity: 0.7 }}>{site}</div>
      </div>
    ),
    {
      ...size,
    }
  );
}
