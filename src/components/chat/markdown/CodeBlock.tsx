"use client";

import React, { useContext } from "react";
import dynamic from "next/dynamic";
import { BlockMath } from "react-katex";
import { InTableCellContext } from "./TableElements";

const MonacoEditor = dynamic(() => import("../../code-editor"), { ssr: false });

const extractRawCode = (node: any, children: any) => {
  if (Array.isArray(children)) {
    return children.map((c) => (typeof c === "string" ? c : "")).join("");
  }
  return typeof children === "string" ? children : "";
};

export function CodeBlock(props: any & { isStreaming?: boolean }) {
  const { node, inline, className, children, isStreaming } = props as any;
  const inTableCell = useContext(InTableCellContext);
  const rawCode = extractRawCode(node, children).trim();
  const match = /language-(\w+)/.exec(className || "");
  const lang = match?.[1]?.toLowerCase();
  const isMathLang = !!lang && ["math", "latex", "tex", "katex"].includes(lang);
  const isPlainLike = !!lang && ["plaintext", "text", "txt", "md", "markdown"].includes(lang);
  const looksCodey = /[{};]|=>|\b(class|function|import|export)\b/.test(rawCode);
  const shouldInlineTiny = !!rawCode && !/\n/.test(rawCode) && rawCode.length <= 40 && !looksCodey;

  if (inline) {
    return (
      <code className="rounded-md border border-zinc-300/60 dark:border-zinc-700 bg-zinc-100 text-zinc-900 dark:bg-zinc-800/70 dark:text-zinc-100 px-1.5 py-0.5 text-[0.95em]">
        {rawCode}
      </code>
    );
  }

  // Treat tiny single-line texty code blocks like inline code (ChatGPT style)
  if (!inline && shouldInlineTiny) {
    return (
      <code className="rounded-md bg-zinc-100 text-zinc-900 dark:bg-zinc-800/70 dark:text-zinc-100 px-1.5 py-0.5 text-[0.95em]">
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
    if (shouldInlineTiny) {
      return (
        <code className="rounded-md border border-zinc-300/60 dark:border-zinc-700 bg-zinc-100 text-zinc-900 dark:bg-zinc-800/70 dark:text-zinc-100 px-1.5 py-0.5 text-[0.95em]">{rawCode}</code>
      );
    }
    return <pre className="my-2 whitespace-pre-wrap break-words text-sm bg-transparent px-0 py-0">{rawCode}</pre>;
  }

  if (isMathLang) {
    if (!rawCode) return null;
    if (isStreaming) {
      return (
        <div className="my-3 whitespace-pre-wrap break-words text-sm bg-zinc-100 dark:bg-zinc-900/70 px-3 py-2 rounded-xl overflow-x-auto max-w-full">
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
        <pre className="my-3 whitespace-pre-wrap break-words text-sm bg-zinc-100 dark:bg-zinc-900/70 px-3 py-2 rounded-xl overflow-x-auto">
          {rawCode}
        </pre>
      );
    }
    if (isStreaming) {
      return (
        <pre className="my-3 whitespace-pre-wrap break-words text-sm bg-zinc-100 dark:bg-zinc-900/70 px-3 py-2 rounded-xl overflow-x-auto">
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
      <pre className="my-3 whitespace-pre-wrap break-words text-sm bg-zinc-100 dark:bg-zinc-900/70 px-3 py-2 rounded-xl overflow-x-auto">{rawCode}</pre>
    );
  }
  return null;
}

export default CodeBlock;
