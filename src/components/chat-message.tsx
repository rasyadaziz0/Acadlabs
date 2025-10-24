"use client";

import React, { useDeferredValue, useMemo, useContext, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { BlockMath } from "react-katex";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { FileText, Share2, Copy, Twitter, Linkedin } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const InTableCellContext = React.createContext(false);

const MonacoEditor = dynamic(() => import("./code-editor"), { ssr: false });

function remarkBrToBreak() {
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

const extractRawCode = (node: any, children: any) => {
  if (Array.isArray(children)) {
    return children.map((c) => (typeof c === "string" ? c : "")).join("");
  }
  return typeof children === "string" ? children : "";
};

const normalizeMathDelimiters = (text: string) => {
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

const normalizeHeadingSpacing = (text: string) => {
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

const collapseTinyFences = (input: string): string => {
  if (!input) return input;
  const fenceRe = /(\n|^)([ \t]{0,3})```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)\n\2```/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  const textLang = new Set(["", "text", "plaintext", "md", "markdown", "http", "sh", "bash"]);
  const codeyRe = /(\{|\}|;|=>|\b(class|function|import|export|const|let|var|return|if|else|for|while|switch|case|break)\b|\n)/;

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


const tightenBodySpacing = (input: string): string => {
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

function fixAndDecodeEntitiesMinimal(input: string): string {
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
      .replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    st = st.replace(/(^|\W)amp;(?![a-zA-Z#0-9]+;)/g, "$1&");
    return st;
  }
}

type AttachmentMeta = { name: string; type?: string; size?: number; ext?: string };
const parseAttachmentMarker = (text: string): { meta?: AttachmentMeta; body: string } => {
  if (!text) return { body: "" };
  const re = /^::attachment\[([^\]]+)\]\s*\n?/;
  const m = text.match(re);
  if (!m) return { body: text };
  const kv = m[1]
    .split(/\s*,\s*/)
    .map((p) => p.split("=").map((s) => s.trim())) as [string, string][];
  const meta: AttachmentMeta = { name: "" } as any;
  for (const [k, v] of kv) {
    const val = v?.replace(/^"|"$/g, "");
    if (k === "name") meta.name = val;
    else if (k === "type") meta.type = val;
    else if (k === "size") meta.size = Number(val);
  }
  if (meta.name && !meta.ext) {
    const i = meta.name.lastIndexOf(".");
    if (i >= 0) meta.ext = meta.name.slice(i + 1).toUpperCase();
  }
  const body = text.replace(re, "");
  return { meta, body };
};
const renderWithBrs = (children: any) => {
  const splitRe = /(?:<br\s*\/?\s*>|&lt;br\s*\/?\s*&gt;)/gi;
  const mapNode = (node: any, keyPrefix = ""): any => {
    if (typeof node === "string") {
      const parts = node.split(splitRe);
      if (parts.length === 1) return node;
      const out: any[] = [];
      parts.forEach((part: string, idx: number) => {
        if (idx > 0) out.push(<br key={`${keyPrefix}br-${idx}`} />);
        if (part) out.push(part);
      });
      return out;
    }
    if (Array.isArray(node)) return node.map((n, i) => mapNode(n, `${keyPrefix}${i}-`));
    return node;
  };
  return mapNode(children);
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  chat_id: string;
  user_id: string;
  created_at: string;
};

type ChatMessageProps = { message?: Message; showCaret?: boolean; isStreaming?: boolean; chatTitle?: string };

function ChatMessage({ message, showCaret = false, isStreaming = false, chatTitle }: ChatMessageProps) {
  if (!message) return null;

  const [linkToOpen, setLinkToOpen] = useState<string | null>(null);
  const [justShared, setJustShared] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)') : null;
    const update = () => setIsMobile(!!mq?.matches);
    update();
    mq?.addEventListener ? mq.addEventListener('change', update) : mq?.addListener?.(update);
    return () => {
      mq?.removeEventListener ? mq.removeEventListener('change', update) : mq?.removeListener?.(update);
    };
  }, []);

  const { meta: attachment, body } = parseAttachmentMarker(message.content);
  const deferredBody = useDeferredValue(body);

  const markdownComponents = useMemo<Components>(
    () => ({
      inlineMath(props: any) {
        const v = (props as any).value ?? "";
        if (isStreaming) return <span>{`$${String(v)}$`}</span>;
        return <span>{`$${String(v)}$`}</span>;
      },
      math(props: any) {
        const v = (props as any).value ?? "";
        if (isStreaming)
          return (
            <pre className="my-3 whitespace-pre-wrap break-words text-sm bg-transparent px-0 py-0 overflow-x-auto">
              {`$$\n${String(v)}\n$$`}
            </pre>
          );
        return <pre className="sr-only" aria-hidden>{String(v)}</pre>;
      },
      code(props: any) {
        const { node, inline, className, children } = props as any;
        const inTableCell = useContext(InTableCellContext);
        const rawCode = extractRawCode(node, children).trim();
        const match = /language-(\w+)/.exec(className || "");
        const lang = match?.[1]?.toLowerCase();
        const isMathLang = !!lang && ["math", "latex", "tex", "katex"].includes(lang);
        const isPlainLike = !!lang && ["plaintext", "text", "txt", "md", "markdown"].includes(lang);

        if (inline) {
          return (
            <code className="bg-zinc-200 text-zinc-900 dark:bg-[#1e1e1e] dark:text-white px-1 py-0.5 rounded break-words">
              {rawCode}
            </code>
          );
        }

        if (inTableCell && rawCode) {
          if (isMathLang) {
            if (!rawCode) return null;
            if (isStreaming) {
              return (
                <pre className="my-2 whitespace-pre-wrap break-words text-sm bg-transparent px-0 py-0 overflow-x-auto max-w-full">{rawCode}</pre>
              );
            }
            return (
              <div className="my-2 overflow-x-auto max-w-full">
                <div className="inline-block max-w-full min-w-0">
                <BlockMath math={rawCode} />
              </div>
              </div>
            );
          }
          return (
            <pre className="my-2 whitespace-pre-wrap break-words text-sm bg-transparent px-0 py-0">{rawCode}</pre>
          );
        }

        if (isMathLang) {
          if (!rawCode) return null;
          if (isStreaming) {
            return (
              <div className="my-3 whitespace-pre-wrap break-words text-sm bg-zinc-200/60 dark:bg-zinc-900/60 px-3 py-2 rounded-2xl overflow-x-auto max-w-full">
                {rawCode}
              </div>
            );
          }
          return (
            <div className="my-4 overflow-x-auto max-w-full">
              <div className="inline-block max-w-full min-w-0">
              <BlockMath math={rawCode} />
            </div>
            </div>
          );
        }

        if (match && rawCode) {
          if (isPlainLike) {
            return (
              <pre className="my-3 whitespace-pre-wrap break-words text-sm bg-zinc-200/60 dark:bg-zinc-900/60 px-3 py-2 rounded overflow-x-auto">
                {rawCode}
              </pre>
            );
          }
          if (isStreaming) {
            return (
              <pre className="my-3 whitespace-pre-wrap break-words text-sm bg-zinc-200/60 dark:bg-zinc-900/60 px-3 py-2 rounded overflow-x-auto">
                {rawCode}
              </pre>
            );
          }
          return (
            <div className="my-3 w-full overflow-x-auto">
              <MonacoEditor code={rawCode} language={lang} readOnly />
            </div>
          );
        }
        if (!inline && rawCode) {
          return (
            <pre className="my-3 whitespace-pre-wrap break-words text-sm bg-zinc-200/60 dark:bg-zinc-900/60 px-3 py-2 rounded overflow-x-auto">{rawCode}</pre>
          );
        }
        return null;
      },
    ul(props: any) {
      const { children } = props as any;
      return (
        <ul className="list-outside list-disc pl-6 my-2 space-y-1">{children}</ul>
      );
    },
    ol(props: any) {
      const { children } = props as any;
      return (
        <ol className="list-outside list-decimal pl-6 my-2 space-y-1">{children}</ol>
      );
    },
    a(props: any) {
      const { children, href } = props as any;
      const url = String(href || "");
      const isAssistant = message.role === "assistant";
      const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (!isAssistant) return; // Only intercept assistant links
        e.preventDefault();
        setLinkToOpen(url);
      };
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="no-underline underline-offset-4 hover:underline decoration-zinc-400"
          onClick={onClick}
        >
          {children}
        </a>
      );
    },
    blockquote(props: any) {
      const { children } = props as any;
      return (
        <blockquote className="border-l-4 border-zinc-300 dark:border-zinc-700 pl-4 italic my-3">{children}</blockquote>
      );
    },
    hr() {
      return <hr className="my-6 border-zinc-200 dark:border-zinc-800" />;
    },
    p(props: any) {
      const { children } = props as any;
      return <div className="break-words whitespace-pre-wrap w-full max-w-full my-2">{renderWithBrs(children)}</div>;
    },
    li(props: any) {
      const { children } = props as any;
      return <li className="break-words whitespace-pre-wrap w-full max-w-full">{renderWithBrs(children)}</li>;
    },
    table(props: any) {
      const { children } = props as any;
      return (
        <div className="not-prose my-3">
          <div className="overflow-x-auto px-2 sm:px-0">
            <table className="w-full min-w-full table-auto border-collapse text-[12px] sm:text-[14px]">
              {children}
            </table>
          </div>
        </div>
      );
    },
    thead(props: any) {
      const { children } = props as any;
      return <thead className="table-header-group bg-zinc-100 dark:bg-zinc-800">{children}</thead>;
    },
    tbody(props: any) {
      const { children } = props as any;
      return <tbody>{children}</tbody>;
    },
    tr(props: any) {
      const { children } = props as any;
      return <tr className="bg-white dark:bg-zinc-900 border-b border-border last:border-b-0">{children}</tr>;
    },
    th(props: any) {
      const { children } = props as any;
      return (
        <InTableCellContext.Provider value={true}>
          <th className="px-3 py-2 text-left align-top text-xs font-semibold text-zinc-600 dark:text-zinc-300 border-b border-border break-words whitespace-pre-wrap">
            {renderWithBrs(children)}
          </th>
        </InTableCellContext.Provider>
      );
    },
    td(props: any) {
      const { children } = props as any;
      return (
        <InTableCellContext.Provider value={true}>
          <td className="px-3 py-2 align-top text-sm leading-relaxed text-foreground dark:text-gray-100 break-words whitespace-pre-wrap sm:border-r border-border last:border-r-0">
            <div className="w-full max-w-[60ch] md:max-w-[65ch]">{renderWithBrs(children)}</div>
          </td>
        </InTableCellContext.Provider>
      );
    },
    img(props: any) {
      const { src, alt } = props as any;
      return <img src={String(src || "")} alt={String(alt || "")} className="rounded-2xl max-w-full h-auto" />;
    },
  }), [isStreaming, message.role]);

  const remarkPluginsArr = useMemo(
    () => [remarkMath, remarkGfm, remarkBrToBreak],
    []
  );
  const rehypePluginsArr = useMemo(() => (isStreaming ? [] : [rehypeKatex]), [isStreaming]);

  const normalizedBody = useMemo(
    () => tightenBodySpacing(collapseTinyFences(normalizeHeadingSpacing(normalizeMathDelimiters(isStreaming ? deferredBody : body)))),
    [isStreaming, deferredBody, body]
  );

  const previewText = useMemo(() => {
    const max = 900;
    const t = normalizedBody || "";
    return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
  }, [normalizedBody]);

  async function handleShareConfirm() {
    try {
      const text = normalizedBody || "";
      const navAny = navigator as any;
      if (navAny && typeof navAny.share === "function") {
        await navAny.share({ title: "AI Answer", text });
        setJustShared(true);
        setTimeout(() => setJustShared(false), 1500);
        return;
      }
      await navigator.clipboard?.writeText(text);
      setJustShared(true);
      setTimeout(() => setJustShared(false), 1500);
    } catch {
    }
  }

  const openWindow = (url: string) => {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      window.location.href = url;
    }
  };

  const shareToX = () => {
    const text = `${chatTitle ? chatTitle + "\n\n" : ""}${previewText}`.slice(0, 240);
    const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
    openWindow(url);
    setShareOpen(false);
  };

  const shareToReddit = () => {
    const title = chatTitle || "AI Answer";
    const text = previewText;
    const url = `https://www.reddit.com/submit?title=${encodeURIComponent(title)}&text=${encodeURIComponent(text)}`;
    openWindow(url);
    setShareOpen(false);
  };

  const shareGeneric = async () => {
    await handleShareConfirm();
    setShareOpen(false);
  };

  const buildShareUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const text = normalizedBody || '';
    const title = chatTitle || '';
    const b64 = (s: string) => {
      try {
        return typeof window !== 'undefined' && window.btoa
          ? window.btoa(unescape(encodeURIComponent(s)))
          : '';
      } catch {
        return '';
      }
    };
    const m = encodeURIComponent(b64(text));
    const t = title ? `&t=${encodeURIComponent(b64(title))}` : '';
    return `${origin}/share?m=${m}${t}`;
  };

  async function handleMobileShare() {
    try {
      const url = buildShareUrl();
      const navAny = navigator as any;
      if (navAny && typeof navAny.share === 'function') {
        await navAny.share({ title: chatTitle || 'AI Answer', url });
        return;
      }
      await navigator.clipboard?.writeText(url);
      setJustShared(true);
      setTimeout(() => setJustShared(false), 1500);
    } catch {
    }
  }

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex w-full justify-start"
    >
      <div
        className={`w-full flex items-start gap-3 sm:gap-4 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}
      >
        <div className="flex-1 min-w-0">
          {message.role === "assistant" ? (
            <div className="w-full">
              <div className="prose dark:prose-invert w-full max-w-[72ch] min-w-0 break-words text-[15px] sm:text-[16px] leading-relaxed prose-headings:tracking-tight prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-2 prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:my-[6px] prose-strong:font-semibold prose-a:no-underline hover:prose-a:underline prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-ul:my-[6px] prose-ol:my-[6px] prose-li:my-1 prose-li:marker:text-zinc-500 dark:prose-li:marker:text-zinc-400 prose-code:bg-zinc-200/70 dark:prose-code:bg-zinc-800/70 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:rounded-lg prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 prose-hr:border-zinc-200 dark:prose-hr:border-zinc-800 prose-blockquote:border-l-4 prose-blockquote:border-zinc-300 dark:prose-blockquote:border-zinc-700 prose-blockquote:pl-4 prose-blockquote:italic">
                <ReactMarkdown
                  remarkPlugins={remarkPluginsArr as any}
                  rehypePlugins={rehypePluginsArr as any}
                  components={markdownComponents}
                >
                  {normalizedBody}
                </ReactMarkdown>
              </div>

              {showCaret && (
                <motion.span
                  aria-hidden
                  initial={{ opacity: 0.25 }}
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="ml-0.5 inline-block align-[-0.15em] w-[8px] h-[1em] bg-current/70 rounded-sm"
                />
              )}

              <div className="mt-2 flex items-center gap-1 text-zinc-500">
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 hover:bg-transparent"
                  onClick={async () => { await navigator.clipboard?.writeText(normalizedBody || ""); setJustShared(true); setTimeout(() => setJustShared(false), 1500); }}
                  aria-label="Copy this answer"
                  title={justShared ? "Copied" : "Copy"}
                >
                  <Copy size={16} />
                </Button>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 hover:bg-transparent"
                  onClick={async () => { if (isMobile) { await handleMobileShare(); } else { setShareOpen(true); } }}
                  aria-label="Share this answer"
                  title={justShared ? "Copied to clipboard" : "Share"}
                >
                  <Share2 size={16} />
                </Button>
                {justShared ? (
                  <span className="text-xs text-zinc-500">Copied</span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="ml-auto w-fit max-w-[85%] sm:max-w-[70%]">
              <div className="rounded-2xl bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50 px-4 py-2.5 shadow-sm">
                {attachment?.name ? (
                  <div className="mb-2 w-full">
                    <div className="flex items-center justify-between rounded-xl bg-zinc-100 dark:bg-zinc-700 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-pink-500/90 text-white flex-shrink-0">
                          <FileText size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium" title={attachment.name}>
                            {attachment.name}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-300">
                            {attachment.ext || (attachment.type ? attachment.type.split("/")[1]?.toUpperCase() : "FILE")}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="text-[14px] sm:text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                  <ReactMarkdown
                    remarkPlugins={remarkPluginsArr as any}
                    rehypePlugins={rehypePluginsArr as any}
                    components={markdownComponents}
                  >
                    {normalizedBody}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>

    <Dialog open={shareOpen} onOpenChange={(open) => { if (!open) setShareOpen(false); }}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="text-[28px] font-bold leading-tight">
            {chatTitle || "Bagikan jawaban"}
          </DialogTitle>
          <DialogDescription className="sr-only">Pratinjau jawaban yang akan dibagikan</DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/80 p-3 sm:p-4 shadow-inner relative">
          <div className="max-h-[360px] md:max-h-[420px] overflow-hidden">
            <div className="prose dark:prose-invert max-w-none text-[15px] leading-relaxed">
              <ReactMarkdown
                remarkPlugins={remarkPluginsArr as any}
                rehypePlugins={rehypePluginsArr as any}
                components={markdownComponents}
              >
                {previewText}
              </ReactMarkdown>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-100 dark:from-zinc-900 to-transparent"></div>
          <div className="absolute bottom-2 right-3 text-sm font-semibold text-zinc-400 select-none">Acadlabs</div>
        </div>
        <div className="mt-2 text-xs text-zinc-500">Hanya jawaban ini yang akan dibagikan</div>
        <div className="mt-3 grid grid-cols-4 gap-4 justify-items-center">
          <div className="flex flex-col items-center gap-2">
            <Button variant="ghost" className="h-12 w-12 rounded-full" onClick={async () => { const url = buildShareUrl(); await navigator.clipboard?.writeText(url); setJustShared(true); setShareOpen(false); setTimeout(() => setJustShared(false), 1500); }} aria-label="Salin tautan jawaban">
              <Copy size={18} />
            </Button>
            <div className="text-xs text-zinc-500">Salin tautan</div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Button variant="ghost" className="h-12 w-12 rounded-full" onClick={shareToX} aria-label="Bagikan ke X">
              <Twitter size={18} />
            </Button>
            <div className="text-xs text-zinc-500">X</div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Button variant="ghost" className="h-12 w-12 rounded-full" onClick={shareGeneric} aria-label="Bagikan ke LinkedIn">
              <Linkedin size={18} />
            </Button>
            <div className="text-xs text-zinc-500">LinkedIn</div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Button variant="ghost" className="h-12 w-12 rounded-full" onClick={shareToReddit} aria-label="Bagikan ke Reddit">
              <Share2 size={18} />
            </Button>
            <div className="text-xs text-zinc-500">Reddit</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!linkToOpen} onOpenChange={(open) => { if (!open) setLinkToOpen(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eh, mau pergi begitu aja? 😢</DialogTitle>
          <DialogDescription>
            Yaelah brok masa pergi begitu aja?... tapi kalau nekat, semoga link baru itu nggak bikin bingung ya
            {" "}
            <a
              href="https://support.google.com/webmasters/answer/3258249?hl=en"
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              Learn more
            </a>
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm break-words whitespace-pre-wrap text-foreground dark:text-gray-100">
          {linkToOpen}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (!linkToOpen) return;
              navigator.clipboard?.writeText(linkToOpen).catch(() => {});
            }}
          >
            Copy link
          </Button>
          <Button
            onClick={() => {
              if (!linkToOpen) return;
              const u = linkToOpen;
              setLinkToOpen(null);
              try {
                window.open(u, "_blank", "noopener,noreferrer");
              } catch {
                window.location.href = u;
              }
            }}
          >
            Open link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

export default React.memo(ChatMessage, (prev, next) => {
  const a = prev.message;
  const b = next.message;
  const sameMsg = a?.id === b?.id && a?.content === b?.content && a?.role === b?.role;
  return sameMsg && prev.showCaret === next.showCaret && prev.isStreaming === next.isStreaming;
});