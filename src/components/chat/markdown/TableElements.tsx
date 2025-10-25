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
    <div className="not-prose my-3">
      <div className="overflow-x-auto px-2 sm:px-0">
        <table className="w-full min-w-full table-auto border-collapse text-[12px] sm:text-[14px]">
          {children}
        </table>
      </div>
    </div>
  );
}

export function Thead(props: any) {
  const { children } = props as any;
  return <thead className="table-header-group bg-zinc-100 dark:bg-zinc-800">{children}</thead>;
}

export function Tbody(props: any) {
  const { children } = props as any;
  return <tbody>{children}</tbody>;
}

export function Tr(props: any) {
  const { children } = props as any;
  return <tr className="bg-white dark:bg-zinc-900 border-b border-border last:border-b-0">{children}</tr>;
}

export function Th(props: any) {
  const { children } = props as any;
  return (
    <InTableCellContext.Provider value={true}>
      <th className="px-3 py-2 text-left align-top text-xs font-semibold text-zinc-600 dark:text-zinc-300 border-b border-border break-words whitespace-pre-wrap">
        {renderWithBrs(children)}
      </th>
    </InTableCellContext.Provider>
  );
}

export function Td(props: any) {
  const { children } = props as any;
  return (
    <InTableCellContext.Provider value={true}>
      <td className="px-3 py-2 align-top text-sm leading-relaxed text-foreground dark:text-gray-100 break-words whitespace-pre-wrap sm:border-r border-border last:border-r-0">
        <div className="w-full max-w-[60ch] md:max-w-[65ch]">{renderWithBrs(children)}</div>
      </td>
    </InTableCellContext.Provider>
  );
}
