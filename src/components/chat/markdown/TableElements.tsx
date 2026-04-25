"use client";

import React from "react";

export const InTableCellContext = React.createContext(false);

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

export function Table(props: any) {
  const { children } = props as any;
  return (
    <div className="not-prose my-4">
      <div className="overflow-x-auto rounded-xl border border-zinc-200/80 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
        <table className="w-full min-w-[540px] table-fixed border-collapse text-[13px] sm:text-[14px]">
          {children}
        </table>
      </div>
    </div>
  );
}

export function Thead(props: any) {
  const { children } = props as any;
  return <thead className="table-header-group bg-zinc-100/90 dark:bg-zinc-900/90">{children}</thead>;
}

export function Tbody(props: any) {
  const { children } = props as any;
  return <tbody>{children}</tbody>;
}

export function Tr(props: any) {
  const { children } = props as any;
  return (
    <tr className="border-b border-zinc-200 bg-white/95 transition-colors odd:bg-zinc-50/45 hover:bg-blue-50/60 last:border-b-0 dark:border-zinc-800 dark:bg-zinc-950/80 dark:odd:bg-zinc-900/70 dark:hover:bg-zinc-800/80">
      {children}
    </tr>
  );
}

export function Th(props: any) {
  const { children } = props as any;
  return (
    <InTableCellContext.Provider value={true}>
      <th className="border-b border-zinc-200 px-3 py-3 text-left align-top text-xs font-semibold uppercase tracking-wide text-zinc-700 first:w-[56px] dark:border-zinc-800 dark:text-zinc-200 sm:px-4">
        {renderWithBrs(children)}
      </th>
    </InTableCellContext.Provider>
  );
}

export function Td(props: any) {
  const { children } = props as any;
  return (
    <InTableCellContext.Provider value={true}>
      <td className="px-3 py-3 align-top text-[13px] leading-7 text-zinc-800 break-words whitespace-pre-wrap first:w-[56px] dark:text-zinc-100 sm:px-4 sm:text-sm">
        <div className="w-full max-w-none">{renderWithBrs(children)}</div>
      </td>
    </InTableCellContext.Provider>
  );
}
