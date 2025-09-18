export async function refineWithGPToss(input: string): Promise<string> {
  function getGroqKeys(): string[] {
    const keys: string[] = [];
    if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);
    if (process.env.GROQ_API_KEY_1) keys.push(process.env.GROQ_API_KEY_1);
    if (process.env.GROQ_API_KEY_2) keys.push(process.env.GROQ_API_KEY_2);
    return Array.from(new Set(keys.filter(Boolean)));
  }

  const keys = getGroqKeys();
  if (keys.length === 0) {
    throw new Error("Missing GROQ API key(s) in server environment");
  }

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  const messages = [
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

  const url = "https://api.groq.com/openai/v1/chat/completions";
  let res: Response | null = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    let attempt: Response | null = null;
    try {
      attempt = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          stream: false,
        }),
      });
    } catch (e) {
      // Network error; try next key if available
      if (i < keys.length - 1) {
        continue;
      }
      throw new Error("Upstream network error");
    }
    if (attempt.ok) {
      res = attempt;
      break;
    }
    res = attempt;
    if (i < keys.length - 1 && [401, 402, 403, 429].includes(attempt.status)) {
      continue; // try next key
    } else {
      break;
    }
  }

  if (!res || !res.ok) {
    const text = res ? await res.text() : "";
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
