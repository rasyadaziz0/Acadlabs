"use client";

import React from "react";
import { FileText } from "lucide-react";

export type AttachmentMeta = { name: string; type?: string; size?: number; ext?: string };

export default function AttachmentPreview({ meta }: { meta?: AttachmentMeta }) {
  if (!meta?.name) return null;
  return (
    <div className="mb-2 w-full">
      <div className="flex items-center justify-between rounded-xl bg-zinc-100 dark:bg-zinc-700 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-pink-500/90 text-white flex-shrink-0">
            <FileText size={16} />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium" title={meta.name}>
              {meta.name}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-300">
              {meta.ext || (meta.type ? meta.type.split("/")[1]?.toUpperCase() : "FILE")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
