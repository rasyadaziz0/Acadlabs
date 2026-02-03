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

  const systemPrompt = `Anda adalah analis pasar profesional. Berikan analisis teknikal yang singkat dan terstruktur.

ATURAN FORMAT WAJIB:
1. SELALU gunakan spasi yang benar antara kata-kata.
2. JANGAN gunakan format matematika ($...$) untuk teks biasa, tanggal, atau kalimat. Gunakan $ HANYA untuk angka murni atau simbol trading (contoh: $100, $BTC).
3. Salah: "$399 pada 28 Januari$" -> Benar: "$399 pada 28 Januari"
4. Format bold: **label:** value (dengan spasi setelah colon)
5. Gunakan dash biasa (-) untuk bullet points

STRUKTUR OUTPUT (IKUTI PERSIS):

## 📊 Analisis [SYMBOL]

**Tren:** [Bullish/Bearish/Sideways]

[Penjelasan 1-2 kalimat tentang tren saat ini. JANGAN gunakan $ untuk teks.]

---

## 🎯 Key Levels

- **Resistance:** $[harga]
- **Support:** $[harga]

---

## ⚡ Sinyal Trading

- **Action:** [BUY/SELL/HOLD]
- **Entry:** $[harga] - $[harga]
- **Target:** $[harga]
- **Stop Loss:** $[harga]

---

## 💡 Reason

- [Alasan 1]
- [Alasan 2]
- [Alasan 3]

PENTING: Gunakan bahasa Indonesia. JANGAN RAPATKAN TEKS. JANGAN PAKAI $ UNTUK KALIMAT.
`;

  const userPrompt = `Analisis aset ${symbol} berdasarkan data market berikut:\n\n${marketData}`;

  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const res = await callGroqWithFallback({
    model,
    messages,
    temperature: 0.4, // Lower temp for stricter adherence
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

  let cleanResponse = rawContent;

  // 1. EMERGENCY FIX: Strip $ wrappers around long text (which causes "glued" rendering in MathJax/KaTeX)
  // Detects $...$ that contains words longer than 3 chars or dates, and removes the $
  cleanResponse = cleanResponse.replace(/\$([^$\n]{10,})\$/g, (match: string, inner: string) => {
    // If identifying simple currency/number like $100 or $1,200.00 -> keep it
    if (/^[\d,.]+$/.test(inner.trim())) return match;
    // If it seems to contain words/sentences -> strip the $
    return inner;
  });

  // 2. Normalize strange Unicode characters that look like standard ones
  cleanResponse = cleanResponse
    .replace(/\u202f/g, " ")    // Narrow non-breaking space (often in numbers) -> standard space
    .replace(/\u00a0/g, " ")    // Non-breaking space -> standard space
    .replace(/[‑−–—]/g, "-")    // Unicode dashes/minuses -> standard hyphen
    .replace(/[∗]/g, "*");      // Unicode asterisk -> standard asterisk

  // 3. Fix specific bolding/list formatting specific to this model's quirks
  cleanResponse = cleanResponse
    // Fix: -**Label:**Value -> - **Label:** Value
    .replace(/-\*\*([^*:]+):\*\*\s*([^\s])/g, "- **$1:** $2")
    // Fix: **Label:**Value -> **Label:** Value
    .replace(/\*\*([^*:]+):\*\*\s*([^\s])/g, "**$1:** $2")
    // Fix: weird spacing around dollar signs: $ 100 -> $100
    .replace(/\$\s+(\d)/g, "$$1");
  // 5. Collapse single newlines that are likely wrapping artifacts
  // (Don't touch lists, headings, or double newlines)
  cleanResponse = cleanResponse
    .replace(/([^\n])\n(?![ \t]*(-|\d+\.|#|\||>|\[))/g, "$1 ");

  // 6. Fix "glued" words (Number-Letter boundaries)
  cleanResponse = cleanResponse
    .replace(/(\d)\s*ke\s*(\d)/gi, "$1 ke $2") // Specific "ke" separator fix
    .replace(/(\d+)([a-zA-Z]+)/g, "$1 $2")    // numberLetter -> number Letter
    .replace(/([a-zA-Z]+)(\d+)/g, "$1 $2");   // letterNumber -> letter Number

  // 7. Fix common concatenated Indonesian patterns
  cleanResponse = cleanResponse
    .replace(/,namun/gi, ", namun")
    .replace(/,yang/gi, ", yang")
    .replace(/,dengan/gi, ", dengan")
    .replace(/,dan/gi, ", dan")
    .replace(/,pada/gi, ", pada")
    .replace(/,di/gi, ", di")
    .replace(/,ke/gi, ", ke")
    .replace(/\.Harga/g, ". Harga")
    .replace(/\.Pola/g, ". Pola")
    .replace(/\.Level/g, ". Level")
    .replace(/\.Support/g, ". Support")
    .replace(/\.Resistance/g, ". Resistance");

  // 8. Clean up excessive whitespace
  cleanResponse = cleanResponse
    .replace(/[ \t]+/g, " ")       // Collapse multiple spaces
    .replace(/\n{3,}/g, "\n\n")    // Max double newline
    .split('\n').map((l: string) => l.trim()).join('\n') // Trim lines
    .trim();

  return cleanResponse;
}
