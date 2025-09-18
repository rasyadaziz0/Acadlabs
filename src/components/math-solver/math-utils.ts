"use client";

// Constants
// Live UI cap during streaming (keeps DOM light)
export const UI_MAX_CHARS = 20_000;
// Server KaTeX render cap per request
export const MAX_RENDER_CHARS = 20_000;
export const PREVIEW_DEBOUNCE_MS = 2000;
export const PREVIEW_AUTO_DISABLE_THRESHOLD = 50_000;
export const AUTO_RENDER_THRESHOLD = 50_000;

// Decode common HTML entities and numeric codes.
export function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  let s = text;
  const named: Record<string, string> = {
    lt: "<",
    gt: ">",
    amp: "&",
    nbsp: " ",
    quot: '"',
    apos: "'",
    // math/common
    le: "≤",
    ge: "≥",
    ne: "≠",
    leq: "≤",
    geq: "≥",
    pm: "±",
    plusmn: "±",
    minus: "−",
    times: "×",
    middot: "·",
    sdot: "·",
    cdot: "·",
    bull: "•",
    bullet: "•",
    hellip: "…",
    ellipsis: "…",
    frasl: "⁄",
    radic: "√",
    sum: "∑",
    prod: "∏",
    int: "∫",
    infin: "∞",
    prop: "∝",
    sim: "∼",
    cong: "≅",
    equiv: "≡",
    asymp: "≈",
    approx: "≈",
    not: "¬",
    and: "∧",
    or: "∨",
    cap: "∩",
    cup: "∪",
    nabla: "∇",
    forall: "∀",
    exist: "∃",
    there4: "∴",
    perp: "⊥",
    // arrows
    larr: "←",
    rarr: "→",
    uarr: "↑",
    darr: "↓",
    harr: "↔",
    rArr: "⇒",
    lArr: "⇐",
    hArr: "⇔",
    // greek subset
    Alpha: "Α", Beta: "Β", Gamma: "Γ", Delta: "Δ", Epsilon: "Ε", Zeta: "Ζ", Eta: "Η", Theta: "Θ",
    Iota: "Ι", Kappa: "Κ", Lambda: "Λ", Mu: "Μ", Nu: "Ν", Xi: "Ξ", Omicron: "Ο", Pi: "Π",
    Rho: "Ρ", Sigma: "Σ", Tau: "Τ", Upsilon: "Υ", Phi: "Φ", Chi: "Χ", Psi: "Ψ", Omega: "Ω",
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", eta: "η", theta: "θ",
    iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο", pi: "π",
    rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
    micro: "µ",
    deg: "°",
  };
  for (let i = 0; i < 2; i++) {
    s = s.replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return _m; }
    });
    s = s.replace(/&#(\d+);/g, (_m, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return _m; }
    });
    s = s.replace(/&([a-zA-Z]+);/g, (_m, name) => (name in named ? named[name] : _m));
    s = s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
  return s;
}

// Normalize non-standard math delimiters and heuristics for inline math.
export function normalizeMathDelimiters(text: string): string {
  if (!text) return text;
  const codeBlockRegex = /```[\s\S]*?```/g;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    result += normalizeOutsideCode(before);
    result += match[0];
    lastIndex = match.index + match[0].length;
  }
  result += normalizeOutsideCode(text.slice(lastIndex));
  return result;

  function normalizeOutsideCode(segment: string) {
    const inlineCodeRegex = /`[^`]*`/g;
    let res = "";
    let li = 0;
    let m: RegExpExecArray | null;
    while ((m = inlineCodeRegex.exec(segment)) !== null) {
      const before = segment.slice(li, m.index);
      res += applyMathNormalization(before);
      const inline = m[0].slice(1, -1);
      const looksLikeTex = /\\[A-Za-z]+/.test(inline) || /[\\^_{}]/.test(inline);
      const hasMathDelims = /\$[\s\S]*?\$/.test(inline) || /\\\([\s\S]*?\\\)/.test(inline) || /\\\[[\s\S]*?\\\]/.test(inline);
      const hasEnv = /\\begin\{(aligned|align\*?|equation\*?|gather\*?|cases|pmatrix|bmatrix|matrix)\}[\s\S]*?\\end\{\1\}/.test(inline);
      if (hasMathDelims) {
        res += inline;
      } else if (hasEnv) {
        res += applyMathNormalization(inline);
      } else if (looksLikeTex) {
        res += `$${inline}$`;
      } else {
        const isShortMathyToken = inline.length <= 12 && /^[A-Za-z0-9_\\^{}<>=+\-*/().,;:]+$/.test(inline);
        if (isShortMathyToken) {
          res += `$${inline}$`;
        } else {
          res += m[0];
        }
      }
      li = m.index + m[0].length;
    }
    res += applyMathNormalization(segment.slice(li));
    return res;
  }

  function applyMathNormalization(s: string) {
    let out = s;
    out = out.replace(/\\\[((?:.|\n)*?)\\\]/g, (_: string, m: string) => `$$${m}$$`);
    out = out.replace(/\\\(((?:.|\n)*?)\\\)/g, (_: string, m: string) => `$${m}$`);
    out = out.replace(/^\s*\[\s*([\s\S]*?)\s*\]\s*$/gm, (_full: string, m: string) => `$$\n${m}\n$$`);
    const envNames = '(aligned|align\\*?|equation\\*?|gather\\*?|cases|pmatrix|bmatrix|matrix)';
    const envRegex = new RegExp(`\\\\begin\\{${envNames}\\}(?:[\\s\\S]*?)\\\\end\\{\\1\\}`, 'g');
    out = out.replace(envRegex, (match: string) => `$$\n${match}\n$$`);
    out = out.replace(/\$\$([^\n]+?)\$\$/g, (_m: string, inner: string) => `$${inner}$`);
    out = out
      .split("\n")
      .map((line) => {
        if (line.includes("$")) return line;
        const re = /(\\(?!begin\b|end\b|item\b)[A-Za-z]+(?:\{[^}]*\})?(?:\s*(?:[<>=]|≤|≥)\s*[-+]?\d+(?:\.\d+)?)?)/g;
        return line.replace(re, (_m, tex) => `$${tex}$`);
      })
      .join("\n");

    const fixInsideInlineMath = (inner: string) => {
      let s = inner;
      const addSlash = (name: string) => {
        const re = new RegExp(`(^|[^\\])(${name})(?=\\b|\\s|[\\}\\]])`, 'g');
        s = s.replace(re, (_m, p1, _p2) => `${p1}\\${name}`);
      };
      s = s.replace(/(^|[^\\])text\{/g, (_m, p1) => `${p1}\\text{`);
      [
        'approx','cdot','times','uparrow','downarrow','rightarrow','leftarrow','Longrightarrow','leq','geq','neq','pm',
        'frac','int','sin','cos','tan','log','ln','sqrt','mathbf','mathit','mathrm','hat','vec'
      ].forEach(addSlash);
      return s;
    };
    out = out.replace(/\$([\s\S]*?)\$/g, (_m: string, inner: string) => `$${fixInsideInlineMath(inner)}$`);

    const coalesce = (text: string) => {
      let result = text;
      for (let i = 0; i < 3; i++) {
        const before = result;
        result = result
          .replace(/\$([\s\S]*?)\$\s*\$([\s\S]*?)\$/g, (_m, a, b) => `$${a} ${b}$`)
          .replace(/\$([\s\S]*?)\$\s*([A-Za-z]|[=+\-*/·⋅×])\s*\$([\s\S]*?)\$/g, (_m, a, mid, b) => `$${a} ${mid} ${b}$`);
        if (result === before) break;
      }
      return result;
    };
    out = coalesce(out);
    return out;
  }
}

// Server-side KaTeX rendering via API
export async function renderOnServer(raw: string, signal?: AbortSignal): Promise<string> {
  const prepared = normalizeMathDelimiters(decodeHtmlEntities(raw)).slice(0, MAX_RENDER_CHARS);
  const res = await fetch("/api/katex-render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown: prepared }),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "Failed to render KaTeX");
    throw new Error(t || "Failed to render KaTeX");
  }
  return await res.text();
}
