const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g; 

export function normalizeWhitespace(input: string): string {
  if (typeof input !== "string") return "";
  let s = input.replace(/\r\n?/g, "\n");
  s = s.replace(CONTROL_CHARS_REGEX, "");
  return s.trim();
}

export function normalizeWhitespaceKeepEdges(input: string): string {
  if (typeof input !== "string") return "";
  let s = input.replace(/\r\n?/g, "\n");
  s = s.replace(CONTROL_CHARS_REGEX, "");
  return s; 
}

export function stripTags(input: string): string {
  if (typeof input !== "string") return "";
  let s = input.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "");
  s = s.replace(/<[^>]*>/g, "");
  return s;
}

export function escapeHtml(input: string): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Escape without converting apostrophes. This prevents KaTeX math from receiving &#39; inside $...$
export function escapeHtmlNoApos(input: string): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

// Escape raw HTML only outside code fences (```...```) and inline code (`...`)
function escapeHtmlOutsideCode(input: string): string {
  if (typeof input !== "string") return "";

  const codeBlockRegex = /```[\s\S]*?```/g;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(input)) !== null) {
    const before = input.slice(lastIndex, match.index);
    result += escapeOutsideInlineCode(before);
    result += match[0]; // keep fenced code unchanged
    lastIndex = match.index + match[0].length;
  }
  result += escapeOutsideInlineCode(input.slice(lastIndex));
  return result;

  function escapeOutsideInlineCode(segment: string): string {
    const inlineCodeRegex = /`[^`]*`/g;
    let res = "";
    let li = 0;
    let m: RegExpExecArray | null;
    while ((m = inlineCodeRegex.exec(segment)) !== null) {
      const before = segment.slice(li, m.index);
      res += escapeHtml(before);
      res += m[0]; // keep inline code unchanged
      li = m.index + m[0].length;
    }
    res += escapeHtml(segment.slice(li));
    return res;
  }
}

function neutralizeJsUrls(input: string): string {
  if (typeof input !== "string") return "";

  return input
    .replace(/javascript:/gi, "javascript:\u200b")
    .replace(/data:/gi, "data:\u200b")
    .replace(/vbscript:/gi, "vbscript:\u200b")
    .replace(/on[a-z]+\s*=\s*/gi, (m) => m.replace(/=/, "=\u200b"));
}

// Neutralize dangerous URL schemes only outside code blocks and inline code
function neutralizeOutsideCode(input: string): string {
  if (typeof input !== "string") return "";
  const codeBlockRegex = /```[\s\S]*?```/g;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(input)) !== null) {
    const before = input.slice(lastIndex, match.index);
    result += neutralizeOutsideInlineCode(before);
    result += match[0];
    lastIndex = match.index + match[0].length;
  }
  result += neutralizeOutsideInlineCode(input.slice(lastIndex));
  return result;

  function neutralizeOutsideInlineCode(segment: string): string {
    const inlineCodeRegex = /`[^`]*`/g;
    let res = "";
    let li = 0;
    let m: RegExpExecArray | null;
    while ((m = inlineCodeRegex.exec(segment)) !== null) {
      const before = segment.slice(li, m.index);
      res += neutralizeJsUrls(before);
      res += m[0];
      li = m.index + m[0].length;
    }
    res += neutralizeJsUrls(segment.slice(li));
    return res;
  }
}

export function sanitizeUserText(input: string): string {
  let s = typeof input === "string" ? input : String(input ?? "");
  s = normalizeWhitespaceKeepEdges(s);
  s = escapeHtmlOutsideCode(s);
  s = neutralizeOutsideCode(s);
  return s;
}

export function sanitizeAIText(input: string): string {
  let s = typeof input === "string" ? input : String(input ?? "");
  s = normalizeWhitespaceKeepEdges(s);
  // Do NOT escape HTML entities for AI output, as react-markdown already
  // treats raw HTML as text (since we don't enable rehypeRaw), and escaping
  // breaks math like a>0 into &gt; which can later become amp;gt.
  // We only neutralize dangerous URL schemes outside code.
  s = neutralizeOutsideCode(s);
  return s;
}

export function sanitizeEmail(input: string): string {
  const s = typeof input === "string" ? input.trim().toLowerCase() : String(input ?? "").trim().toLowerCase();
  return s;
}

export function isValidEmail(email: string): boolean {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) return false;
  if (/[<>"']/g.test(email)) return false;
  return true;
}
export function sanitizeSearchQuery(input: string): string {
  return sanitizeUserText(input);
}
