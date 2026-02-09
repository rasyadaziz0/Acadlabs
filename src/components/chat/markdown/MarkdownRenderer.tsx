"use client";

import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import LinkDialog from "../LinkDialog";
import { CodeBlock } from "./CodeBlock";
import { Table, Thead, Tbody, Tr, Th, Td } from "./TableElements";
import { remarkBrToBreak } from "./plugins";
import { decodeHtmlEntities } from "@/components/math-solver/math-utils";
import DOMPurify from "isomorphic-dompurify";

export interface MarkdownRendererProps {
  content: string;
  role: "user" | "assistant";
  isStreaming?: boolean;
  onNormalizedChange?: (text: string) => void;
}

// Copied from SolverOutput.tsx to match MathSolver layout
function normalizeDelimiters(input: string): string {
  let s = input || "";
  // Convert \[...\] and \(...\) to $$...$$ and $...$
  s = s.replace(/\\\[((?:.|\n)*?)\\\]/g, (_: string, m: string) => `$$${m}$$`);
  s = s.replace(/\\\(((?:.|\n)*?)\\\)/g, (_: string, m: string) => `$${m}$`);
  return s;
}

function renderWithBrs(children: any) {
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
}

export default function MarkdownRenderer({ content, role, isStreaming = false, onNormalizedChange }: MarkdownRendererProps) {
  const [linkToOpen, setLinkToOpen] = useState<string | null>(null);
  const deferred = useDeferredValue(content);

  // 1. Sanitize raw input to strip scripts/iframes before any processing
  const cleanContent = useMemo(() => {
    const raw = isStreaming ? deferred : content;
    return DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true }, // Default safe HTML profile
      FORBID_TAGS: ["script", "iframe", "object", "embed", "base", "head", "link", "meta", "title"],
      FORBID_ATTR: ["style", "on*"], // Strip style and all event handlers
      ADD_TAGS: [], // No extra tags allowed
      ADD_ATTR: [],
    });
  }, [isStreaming, deferred, content]);

  // Use MathSolver's cleanup pipeline for "neat" layout
  const normalizedBody = useMemo(
    () => normalizeDelimiters(decodeHtmlEntities(cleanContent)),
    [cleanContent]
  );

  useEffect(() => {
    if (onNormalizedChange) onNormalizedChange(normalizedBody || "");
  }, [normalizedBody, onNormalizedChange]);

  const markdownComponents = useMemo<Components>(
    () => ({
      code(props: any) {
        return <CodeBlock {...props} isStreaming={isStreaming} />;
      },
      h1(props: any) {
        const { children } = props as any;
        return <h1 className="text-2xl font-semibold mt-6 mb-4 tracking-tight">{children}</h1>;
      },
      h2(props: any) {
        const { children } = props as any;
        return <h2 className="text-xl font-semibold mt-5 mb-3 tracking-tight">{children}</h2>;
      },
      h3(props: any) {
        const { children } = props as any;
        return <h3 className="text-lg font-semibold mt-4 mb-2 tracking-tight">{children}</h3>;
      },
      h4(props: any) {
        const { children } = props as any;
        return <h4 className="text-base font-semibold mt-3 mb-2">{children}</h4>;
      },
      h5(props: any) {
        const { children } = props as any;
        return <h5 className="text-sm font-semibold mt-3 mb-2">{children}</h5>;
      },
      h6(props: any) {
        const { children } = props as any;
        return <h6 className="text-sm font-semibold mt-3 mb-2">{children}</h6>;
      },
      ul(props: any) {
        const { children } = props as any;
        return <ul className="list-outside list-disc pl-6 my-[6px] space-y-1">{children}</ul>;
      },
      ol(props: any) {
        const { children } = props as any;
        return <ol className="list-outside list-decimal pl-6 my-[6px] space-y-1">{children}</ol>;
      },
      a(props: any) {
        const { children, href } = props as any;
        const url = String(href || "");
        const isAssistant = role === "assistant";
        const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
          if (!isAssistant) return; // Only intercept assistant links
          e.preventDefault();
          setLinkToOpen(url);
        };
        return (
          <a href={url} target="_blank" rel="noreferrer noopener" className="no-underline underline-offset-4 hover:underline decoration-zinc-400" onClick={onClick}>
            {children}
          </a>
        );
      },
      blockquote(props: any) {
        const { children } = props as any;
        return <blockquote className="border-l-4 border-zinc-300 dark:border-zinc-700 pl-4 italic my-3">{children}</blockquote>;
      },
      hr() {
        return <hr className="my-6 border-t border-zinc-300/50 dark:border-zinc-700/50" />;
      },
      p(props: any) {
        const { children } = props as any;
        return <div className="break-words whitespace-normal w-full max-w-full my-[6px] leading-relaxed">{renderWithBrs(children)}</div>;
      },
      li(props: any) {
        const { children } = props as any;
        return <li className="break-words whitespace-normal w-full max-w-full leading-relaxed my-1">{renderWithBrs(children)}</li>;
      },
      strong(props: any) {
        const { children } = props as any;
        return <strong className="font-semibold text-foreground">{children}</strong>;
      },
      table: Table as any,
      thead: Thead as any,
      tbody: Tbody as any,
      tr: Tr as any,
      th: Th as any,
      td: Td as any,
      img(props: any) {
        const { src, alt } = props as any;
        if (!src) return null;
        return <img src={String(src)} alt={String(alt || "")} className="rounded-2xl max-w-full h-auto" />;
      },
    }),
    [isStreaming, role]
  );

  const remarkPluginsArr = useMemo(() => [remarkMath, remarkGfm, remarkBrToBreak], []);
  const rehypePluginsArr = useMemo(() => (isStreaming ? [] : [rehypeKatex]), [isStreaming]);

  return (
    <>
      <ReactMarkdown
        remarkPlugins={remarkPluginsArr as any}
        rehypePlugins={rehypePluginsArr as any}
        components={markdownComponents}
        urlTransform={(value: string) => value}
      >
        {normalizedBody}
      </ReactMarkdown>
      <LinkDialog url={linkToOpen} onOpenChange={(open) => setLinkToOpen(open ? linkToOpen : null)} />
    </>
  );
}
