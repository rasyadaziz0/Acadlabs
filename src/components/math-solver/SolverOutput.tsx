"use client";

import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { decodeHtmlEntities } from "./math-utils";

type Props = {
  solution: string | null | undefined; // final answer only (non-streaming)
  className?: string;
  // Legacy optional props for compatibility (ignored by this component)
  isStreaming?: boolean;
  previewHtml?: string;
  previewDisabledReason?: string;
  renderedHtml?: string;
  isRendering?: boolean;
  manualRenderMode?: boolean;
  onManualRender?: () => void;
  renderError?: string;
  didTruncate?: boolean;
  fullDownloadUrl?: string;
};

// Constants
export const UI_MAX_CHARS_RENDER = 20_000; // consistency with historical cap (not used directly)
export const MAX_KATEX_INPUT = 10_000;
export const HARD_TRUNCATE_SUFFIX = "\n...[truncated]";
export const MAX_FULL_RENDER_CHARS = 200_000; // if exceeded: don't KaTeX-render; offer download instead

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Normalize some non-standard math delimiters so detection is easier
function normalizeDelimiters(input: string): string {
  let s = input || "";
  // Convert \[...\] and \(...\) to $$...$$ and $...$
  s = s.replace(/\\\[((?:.|\n)*?)\\\]/g, (_: string, m: string) => `$$${m}$$`);
  s = s.replace(/\\\(((?:.|\n)*?)\\\)/g, (_: string, m: string) => `$${m}$`);
  return s;
}

// Render text that may contain a mix of plain text and math ($...$, $$...$$)
function renderWithKatex(markdown: string): string {
  const src = normalizeDelimiters((markdown || "").replace(/\r\n/g, "\n"));
  const regex = /\$\$([\s\S]*?)\$\$|\$([^$][\s\S]*?)\$(?!\$)/g;

  let out = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(src)) !== null) {
    // Escape the text between previous match and this match
    if (m.index > lastIndex) {
      const between = src.slice(lastIndex, m.index);
      out += escapeHtml(between).replace(/\n/g, "<br/>");
    }

    try {
      if (m[1] !== undefined) {
        // $$ ... $$ (display)
        const math = m[1];
        const html = katex.renderToString(math, {
          displayMode: true,
          throwOnError: false,
          strict: "ignore",
          output: "html",
          trust: false,
        });
        out += `<div class="katex-display">${html}</div>`;
      } else if (m[2] !== undefined) {
        // $ ... $ (inline)
        const math = m[2];
        const html = katex.renderToString(math, {
          displayMode: false,
          throwOnError: false,
          strict: "ignore",
          output: "html",
          trust: false,
        });
        out += `<span class="katex">${html}</span>`;
      }
    } catch (e) {
      // On unexpected error, emit the raw escaped content to avoid crash
      const raw = m[0] || "";
      out += escapeHtml(raw).replace(/\n/g, "<br/>");
    }

    lastIndex = regex.lastIndex;
  }

  // Tail after last match
  if (lastIndex < src.length) {
    const tail = src.slice(lastIndex);
    out += escapeHtml(tail).replace(/\n/g, "<br/>");
  }

  return out;
}

export default function SolverOutput({ solution, className, renderedHtml }: Props) {
  const raw = String(solution ?? "");

  // If parent provided server-rendered HTML, prefer it (legacy compat)
  if (renderedHtml) {
    return (
      <div className={`p-4 border border-border rounded bg-card text-card-foreground overflow-auto ${className || ""}`}>
        <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      </div>
    );
  }

  // For extremely long solutions, avoid KaTeX and provide download option
  if (raw.length > MAX_FULL_RENDER_CHARS) {
    const preview = raw.slice(0, Math.min(5000, raw.length));
    const handleDownload = () => {
      try {
        const blob = new Blob([raw], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "math-solution.txt";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {}
    };
    return (
      <div className={`p-4 border border-border rounded bg-card text-card-foreground overflow-auto ${className || ""}`}>
        <div className="text-sm text-muted-foreground mb-2">
          Output sangat panjang; menampilkan pratinjau awal saja. Gunakan tombol di bawah untuk mengunduh hasil lengkap.
        </div>
        <pre className="whitespace-pre-wrap text-sm">{preview}{"\n"}{HARD_TRUNCATE_SUFFIX}</pre>
        <button
          type="button"
          onClick={handleDownload}
          className="mt-3 inline-flex items-center rounded-md bg-muted px-3 py-1.5 text-sm hover:bg-muted/80"
        >
          Download full result
        </button>
      </div>
    );
  }

  const { error, shown, wasTruncated } = useMemo(() => {
    try {
      if (!raw) return { error: "", shown: "", wasTruncated: false };
      // No pre-render string building; we will render Markdown below.
      // We only compute flags for UI (download button visibility) and safe preview text for error case.
      const truncated = raw.length > MAX_KATEX_INPUT;
      const shown = raw.slice(0, MAX_KATEX_INPUT) + (truncated ? HARD_TRUNCATE_SUFFIX : "");
      return { error: "", shown, wasTruncated: truncated };
    } catch (e: any) {
      console.error("[katex] pre-render error:", e);
      const safe = (raw.slice(0, MAX_KATEX_INPUT) + (raw.length > MAX_KATEX_INPUT ? HARD_TRUNCATE_SUFFIX : ""));
      return { error: e?.message || "Failed to prepare content", shown: safe, wasTruncated: raw.length > MAX_KATEX_INPUT };
    }
  }, [raw]);

  if (error) {
    return (
      <div className={`p-4 border border-border rounded bg-card text-card-foreground overflow-auto ${className || ""}`}>
        <div className="text-red-600 text-sm mb-2">KaTeX error: {error}</div>
        <pre className="whitespace-pre-wrap text-sm">{shown}</pre>
      </div>
    );
  }

  const handleDownloadFull = () => {
    try {
      const blob = new Blob([raw], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "math-solution.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  };

  return (
    <div className={`p-4 border border-border rounded bg-card text-card-foreground overflow-auto ${className || ""}`}>
      <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed prose-headings:mt-3 prose-headings:mb-2 prose-p:my-[6px] prose-ul:my-[6px] prose-ol:my-[6px] prose-li:my-1">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { strict: "ignore", throwOnError: false, trust: false, output: "html" }]]}
          components={{
            // Tables keep line breaks
            th: ({ node, children, ...props }) => (
              <th {...props} className="whitespace-pre-wrap">
                {children}
              </th>
            ),
            td: ({ node, children, ...props }) => (
              <td {...props} className="whitespace-pre-wrap">
                {children}
              </td>
            ),
          }}
        >
          {normalizeDelimiters(decodeHtmlEntities(raw))}
        </ReactMarkdown>
      </div>
      {wasTruncated ? (
        <button
          type="button"
          onClick={handleDownloadFull}
          className="mt-3 inline-flex items-center rounded-md bg-muted px-3 py-1.5 text-sm hover:bg-muted/80"
        >
          Download full result
        </button>
      ) : null}
    </div>
  );
}
