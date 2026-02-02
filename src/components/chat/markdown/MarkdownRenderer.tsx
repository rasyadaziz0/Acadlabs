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
import { remarkBrToBreak, normalizeMathDelimiters, normalizeHeadingSpacing, collapseTinyFences, tightenBodySpacing, mergeInlineTokenLines, fixAndDecodeEntitiesMinimal, normalizeBoldSpacing } from "./plugins";

export interface MarkdownRendererProps {
  content: string;
  role: "user" | "assistant";
  isStreaming?: boolean;
  onNormalizedChange?: (text: string) => void;
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

  const normalizedBody = useMemo(
    () =>
      tightenBodySpacing(
        mergeInlineTokenLines(
          collapseTinyFences(
            normalizeHeadingSpacing(
              normalizeMathDelimiters(
                fixAndDecodeEntitiesMinimal(
                  normalizeBoldSpacing(isStreaming ? deferred : content) // Add Bold Normalization Here
                )
              )
            )
          )
        )
      ),
    [isStreaming, deferred, content]
  );

  useEffect(() => {
    if (onNormalizedChange) onNormalizedChange(normalizedBody || "");
  }, [normalizedBody, onNormalizedChange]);

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
            <pre className="my-3 whitespace-pre-wrap break-words text-sm bg-transparent px-0 py-0 overflow-x-auto">{`$$\n${String(v)}\n$$`}</pre>
          );
        return <pre className="sr-only" aria-hidden>{String(v)}</pre>;
      },
      code(props: any) {
        return <CodeBlock {...props} isStreaming={isStreaming} />;
      },
      ul(props: any) {
        const { children } = props as any;
        return <ul className="list-outside list-disc pl-6 my-2 space-y-2">{children}</ul>;
      },
      ol(props: any) {
        const { children } = props as any;
        return <ol className="list-outside list-decimal pl-6 my-2 space-y-2">{children}</ol>;
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
        return <hr className="my-6 border-zinc-200 dark:border-zinc-800" />;
      },
      p(props: any) {
        const { children } = props as any;
        return <div className="break-words whitespace-normal w-full max-w-full my-2">{renderWithBrs(children)}</div>;
      },
      li(props: any) {
        const { children } = props as any;
        return <li className="break-words whitespace-normal w-full max-w-full">{renderWithBrs(children)}</li>;
      },
      table: Table as any,
      thead: Thead as any,
      tbody: Tbody as any,
      tr: Tr as any,
      th: Th as any,
      td: Td as any,
      img(props: any) {
        const { src, alt } = props as any;
        return <img src={String(src || "")} alt={String(alt || "")} className="rounded-2xl max-w-full h-auto" />;
      },
    }),
    [isStreaming, role]
  );

  const remarkPluginsArr = useMemo(() => [remarkMath, remarkGfm, remarkBrToBreak], []);
  const rehypePluginsArr = useMemo(() => (isStreaming ? [] : [rehypeKatex]), [isStreaming]);

  return (
    <>
      <ReactMarkdown remarkPlugins={remarkPluginsArr as any} rehypePlugins={rehypePluginsArr as any} components={markdownComponents}>
        {normalizedBody}
      </ReactMarkdown>
      <LinkDialog url={linkToOpen} onOpenChange={(open) => setLinkToOpen(open ? linkToOpen : null)} />
    </>
  );
}
