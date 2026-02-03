// Convert literal <br> or &lt;br&gt; into hard breaks, skipping code/math nodes
export function remarkBrToBreak() {
  return (tree: any) => {
    const splitRe = /(?:<br\s*\/?\s*>|&lt;br\s*\/?\s*&gt;)/gi;

    function shouldSkip(node: any) {
      return node?.type === "code" || node?.type === "inlineCode" || node?.type === "math" || node?.type === "inlineMath";
    }

    function transform(node: any) {
      if (!node || shouldSkip(node)) return;
      const children: any[] = node.children;
      if (Array.isArray(children)) {
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (!child) continue;
          if (child.type === "text" && typeof child.value === "string" && splitRe.test(child.value)) {
            splitRe.lastIndex = 0; // reset regex state
            const parts = child.value.split(splitRe);
            const newNodes: any[] = [];
            parts.forEach((part: string, idx: number) => {
              if (part) newNodes.push({ type: "text", value: part });
              if (idx < parts.length - 1) newNodes.push({ type: "break" });
            });
            children.splice(i, 1, ...newNodes);
            i += newNodes.length - 1;
          } else if (child.children && !shouldSkip(child)) {
            transform(child);
          }
        }
      }
    }

    transform(tree);
  };
}

// Normalizes non-standard math delimiters to $ ... $ and $$ ... $$ outside code
export const normalizeMathDelimiters = (text: string) => {
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
      res += m[0];
      li = m.index + m[0].length;
    }
    res += applyMathNormalization(segment.slice(li));
    return res;
  }

  function applyMathNormalization(s: string) {
    let out = s;
    out = out.replace(/\\\[((?:.|\n)*?)\\\]/g, (_: string, m: string) => {
      return /[A-Za-z]/.test(m) ? `$$${m}$$` : `\\[${m}\\]`;
    });
    out = out.replace(/\\\(((?:.|\n)*?)\\\)/g, (_: string, m: string) => {
      return /[A-Za-z]/.test(m) ? `$${m}$` : `\\(${m}\\)`;
    });
    return out;
  }
};

// Ensures a space after heading markers (#) outside code and inline code
export const normalizeHeadingSpacing = (text: string) => {
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
      res += apply(before);
      res += m[0];
      li = m.index + m[0].length;
    }
    res += apply(segment.slice(li));
    return res;
  }

  function apply(s: string) {
    return s.replace(/^(\s{0,3}#{1,6})(?:[ \t\u00A0]+)?(\S)/gm, "$1 $2");
  }
};

// Collapse tiny single-line text fences to inline code
export const collapseTinyFences = (input: string): string => {
  if (!input) return input;
  const fenceRe = /(\n|^)([ \t]{0,3})```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)\n\2```/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  const textLang = new Set(["", "text", "plaintext", "md", "markdown", "none", "nohighlight", "http", "sh", "bash"]);
  const codeyRe = /(\{|\}|;|=>|\b(class|function|import|export|const|let|var|public|private|void|int|string|package|using|namespace)\b|\n)/;

  while ((m = fenceRe.exec(input)) !== null) {
    const segStart = m.index + (m[1] ? m[1].length : 0); // keep preceding newline if present
    out += input.slice(last, segStart);
    const lang = String(m[3] || "").toLowerCase();
    const bodyRaw = String(m[4] || "");
    const body = bodyRaw.trim();
    const singleLine = !/\n/.test(body);
    const isTexty = textLang.has(lang);
    const isShort = body.length <= 80;
    const looksCodey = codeyRe.test(body);

    if (singleLine && isShort && isTexty && !looksCodey) {
      out += "`" + body + "`";
    } else {
      out += m[0].slice(m[1] ? m[1].length : 0); // emit fence without duplicating kept newline
    }
    last = fenceRe.lastIndex;
  }
  out += input.slice(last);
  return out;
};

// Tighten general body spacing while avoiding code blocks
export const tightenBodySpacing = (input: string): string => {
  if (!input) return input;
  const codeBlockRegex = /```[\s\S]*?```/g;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(input)) !== null) {
    const before = input.slice(lastIndex, match.index);
    result += apply(before);
    result += match[0];
    lastIndex = match.index + match[0].length;
  }
  result += apply(input.slice(lastIndex));
  return result;

  function apply(segment: string): string {
    let s = segment.replace(/\n{3,}/g, "\n\n");
    s = s.replace(/\n\s*\.(?=\s*(\n|$))/g, ".");
    s = s.replace(/\n\s*\)(?=\s*(\n|$))/g, ")");
    s = s.replace(/(?<=\S)\s*\n\s*\(/g, " (");
    s = s.replace(/\(\s*\n\s*/g, "(");
    s = s.replace(/\n\s*(`[^`\n]{1,80}`)\s*\n/g, " $1 ");
    s = s.replace(/(^|\n)\s*(\d{1,3})[\.)]\s*\n+\s*(?=\S)/g, "$1$2. ");
    return s;
  }
};

export const mergeInlineTokenLines = (input: string): string => {
  if (!input) return input;
  const codeBlockRegex = /```[\s\S]*?```/g;
  let out = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = codeBlockRegex.exec(input)) !== null) {
    const before = input.slice(lastIndex, m.index);
    out += mergeSegment(before);
    out += m[0];
    lastIndex = m.index + m[0].length;
  }
  out += mergeSegment(input.slice(lastIndex));
  return out;

  function isInlineCodeLine(line: string) {
    return /^\s*`[^`\n]+`\s*$/.test(line);
  }
  function isPunctLine(line: string) {
    return /^\s*[.,:;!?]\s*$/.test(line);
  }
  function isConnectorLine(line: string) {
    return /^\s*(dan|atau|and)\s*$/i.test(line);
  }

  function mergeTokens(tokens: string[]): string {
    let res = "";
    for (const t of tokens) {
      const token = t.trim();
      if (!token) continue;
      if (/^[.,:;!?]$/.test(token)) {
        // attach punctuation to previous without extra space
        res = res.replace(/\s+$/g, "");
        res += token + " ";
      } else if (/^(dan|atau|and)$/i.test(token)) {
        res += (res ? " " : "") + token + " ";
      } else {
        res += (res ? " " : "") + token;
      }
    }
    return res.trim();
  }

  function mergeSegment(segment: string) {
    const lines = segment.split(/\n/);
    const outLines: string[] = [];
    let buf: string[] = [];

    const flush = () => {
      if (buf.length) {
        outLines.push(mergeTokens(buf));
        buf = [];
      }
    };

    for (const raw of lines) {
      const line = raw;
      if (isInlineCodeLine(line) || isPunctLine(line) || isConnectorLine(line)) {
        buf.push(line.trim());
      } else {
        flush();
        outLines.push(line);
      }
    }
    flush();
    return outLines.join("\n");
  }
};

// Minimal entity fix/decoder, ignoring fenced/inline code
export function fixAndDecodeEntitiesMinimal(input: string): string {
  if (!input) return input;
  const codeBlockRegex = /```[\s\S]*?```/g;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(input)) !== null) {
    const before = input.slice(lastIndex, match.index);
    result += decodeOutsideInline(before);
    result += match[0]; // keep fenced code unchanged
    lastIndex = match.index + match[0].length;
  }
  result += decodeOutsideInline(input.slice(lastIndex));
  return result;

  function decodeOutsideInline(segment: string): string {
    const inlineCodeRegex = /`[^`]*`/g;
    let res = "";
    let li = 0;
    let m: RegExpExecArray | null;
    while ((m = inlineCodeRegex.exec(segment)) !== null) {
      const before = segment.slice(li, m.index);
      res += decodeMinimal(before);
      res += m[0]; // keep inline code unchanged
      li = m.index + m[0].length;
    }
    res += decodeMinimal(segment.slice(li));
    return res;
  }

  function decodeMinimal(s: string): string {
    let st = s.replace(/amp;([a-zA-Z#0-9]+;)/g, "&$1");
    st = st
      .replace(/&amp;/g, "&")
      .replace(/&gt;/g, ">");
    st = st.replace(/&lt;/g, "<")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    st = st.replace(/(^|\W)amp;(?![a-zA-Z#0-9]+;)/g, "$1&");
    return st;
  }
}

/**
 * Hapus spasi di dalam tag bold: "** Teks **" -> "**Teks**"
 */
export const normalizeBoldSpacing = (text: string) => {
  if (!text) return text;
  return text.replace(/\*\*\s+([^*]+?)\s+\*\*/g, "**$1**");
};
