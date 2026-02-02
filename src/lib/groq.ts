import { callGroqWithFallback, getGroqKeys } from "@/lib/ai-service";

export async function refineWithGPToss(input: string): Promise<string> {
  const keys = getGroqKeys();
  if (keys.length === 0) {
    throw new Error("Missing GROQ API key(s) in server environment");
  }

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  const messages: { role: "system" | "user"; content: string }[] = [
    {
      role: "system",
      content: [
        "Refine and improve the following analysis.",
        "- Keep original facts; do not invent details.",
        "- Be concise, structured, and clear.",
        "- Use Markdown with headings and bullet points when helpful.",
        "- If there is math, use $...$ for inline and $$...$$ for block equations.",
      ].join("\n"),
    },
    {
      role: "user",
      content: String(input ?? "").trim(),
    },
  ];

  const res = await callGroqWithFallback({
    model,
    messages,
    temperature: 0.3,
    stream: false,
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      throw new Error(j?.error?.message || j?.message || `Groq API error (${res?.status ?? 500})`);
    } catch {
      throw new Error(text || `Groq API error (${res?.status ?? 500})`);
    }
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  return (typeof content === "string" ? content : "").trim();
}

export async function analyzeMarketDataWithGroq(symbol: string, marketData: string): Promise<string> {
  const keys = getGroqKeys();
  if (keys.length === 0) {
    throw new Error("Missing GROQ API key(s) in server environment");
  }

  // CONSTRAINT 1: Wajib menggunakan model openai/gpt-oss-120b
  const model = "openai/gpt-oss-120b";

  const systemPrompt = `
    Anda adalah Market Analyst Professional.
    Tugas: Analisis data market berikut dan berikan insight singkat.

    ATURAN WAJIB:
    1. SPASI: Pastikan ada spasi antara teks dan angka/bold.
      - Contoh: "Target: **35.00** USD" (Jangan nempel).
    2. MARKDOWN:
      - Gunakan format standard (**bold**, ### Header).
      - Jangan gunakan karakter aneh seperti '∗'.

    Struktur Analisis:
    ### 📊 Analisis [Simbol]
    - **Tren:** [Bullish/Bearish]
    - **Setup:** [Pola Chart]

    ### 🎯 Key Levels
    - **Resistance:** [Harga]
    - **Support:** [Harga]

    ### ⚡ Sinyal
    - **Action:** [BUY/SELL/WAIT]
    - **Entry:** [Area]
    - **Target:** [Harga]
    - **SL:** [Harga]
  `;

  const userPrompt = `Tolong analisis aset ${symbol} berdasarkan data berikut:\n\n${marketData}`;

  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const res = await callGroqWithFallback({
    model,
    messages,
    temperature: 0.5, // Agak rendah agar patuh aturan formatting
    stream: false,
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      throw new Error(j?.error?.message || j?.message || `Groq API error (${res?.status ?? 500})`);
    } catch {
      throw new Error(text || `Groq API error (${res?.status ?? 500})`);
    }
  }

  const data = await res.json();
  const rawContent = data?.choices?.[0]?.message?.content || "";

  if (!rawContent) return "Maaf, analisis gagal dimuat.";

  // CONSTRAINT 2: Regex Post-Processing untuk memaksa spasi
  const cleanResponse = rawContent
    .replace(/[ \t]+/g, " ")    // Hapus spasi berlebih tapi biarkan newline
    .replace(/ : /g, ": ")      // Rapikan titik dua
    .replace(/ \./g, ".")       // Rapikan titik akhir
    .replace(/ ,/g, ",")        // Rapikan koma
    .replace(/\( /g, "(")       // Rapikan kurung buka
    .replace(/ \)/g, ")")       // Rapikan kurung tutup
    .trim();

  return cleanResponse;
}
