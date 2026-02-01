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
