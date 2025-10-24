import { normalizeWhitespace } from "./sanitize";

function removeLeadingPhrases(s: string): string {
  let out = s.trim();
  const patterns: RegExp[] = [
    /^(tolong|mohon)\b[\s,;:-]*/i,
    /^(bisakah|apakah)\b[\s,;:-]*/i,
    /^(apa itu|apa|siapa|bagaimana|mengapa|kenapa)\b[\s,;:-]*/i,
    /^(jelaskan|tentukan|hitung|buatkan|buat|carikan|cari|tuliskan|berikan)\b(?:\s+(saya|kami|aku|kamu|anda))?[\s,;:-]*/i,
    /^(please|explain|what is|calculate|compute|generate|make|write)\b[\s,;:-]*/i,
    /^(tentang|mengenai|perihal|membahas)\b[\s,;:-]*/i,
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of patterns) {
      const next = out.replace(re, "");
      if (next !== out) {
        out = next.trim();
        changed = true;
      }
    }
  }
  return out;
}

function pickFirstClause(s: string): string {
  const firstLine = s.split(/\r?\n/)[0] || s;
  const idx = firstLine.search(/[\.\?\!]/);
  return idx !== -1 ? firstLine.slice(0, idx) : firstLine;
}

function titleCaseSmart(input: string): string {
  const lowers = new Set([
    "dan","atau","yang","di","ke","dari","pada","untuk","dengan","dalam","serta","atau","ke" 
  ]);
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      if (/[^A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/.test(w)) return w; // keep math/special tokens
      const lower = w.toLowerCase();
      if (i > 0 && lowers.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function trimLength(s: string, max = 40): string {
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > 16) cut = cut.slice(0, lastSpace);
  return cut.trim().replace(/[\s,:;\-]+$/g, "") + "…";
}

export function generateChatTitleFromUserInput(text: string): string {
  let s = normalizeWhitespace(String(text ?? ""));
  s = s.replace(/^#+\s*/, "");
  s = s.replace(/^::attachment[^\n]*\n?/, "");
  s = s.replace(/```[\s\S]*?```/g, "");
  s = pickFirstClause(s);
  s = removeLeadingPhrases(s);
  s = s.replace(/^["'“”‘’\(\[]+|["'“”‘’\)\]]+$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "Untitled Chat";
  const cased = titleCaseSmart(s);
  return trimLength(cased, 40);
}
