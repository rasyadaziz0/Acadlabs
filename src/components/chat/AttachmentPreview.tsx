import React from "react";
import { FileText, Download, X } from "lucide-react";

export interface AttachmentMeta {
  name?: string;
  size?: number;
  type?: string;
  url?: string;
  ext?: string;
}

interface AttachmentPreviewProps {
  url?: string;
  type?: string;
  name?: string;
  isUploading?: boolean;
  onRemove?: () => void;
  // Backward compatibility for legacy code using 'meta' prop
  meta?: AttachmentMeta;
}

export default function AttachmentPreview({
  url,
  type,
  name = "Attachment",
  isUploading = false,
  onRemove,
  meta
}: AttachmentPreviewProps) {
  // Resolve props from direct args OR meta
  const finalUrl = url || meta?.url || "";
  const finalType = type || meta?.type || "application/octet-stream";
  const finalName = name !== "Attachment" ? name : (meta?.name || "Attachment");

  // If no URL and no meta, render nothing or placeholder?
  if (!finalUrl && !meta) return null;

  const isImage = finalType.startsWith("image/");

  if (isImage && finalUrl) {
    return (
      <div className="relative group inline-block max-w-[300px]">
        <img
          src={finalUrl}
          alt={finalName}
          className={`rounded-2xl border border-black/10 dark:border-white/10 shadow-sm max-h-[300px] w-auto object-contain bg-zinc-100 dark:bg-zinc-800 ${isUploading ? "opacity-50" : ""
            }`}
        />
        {onRemove && (
          <button
            onClick={onRemove}
            className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }

  // File Card for non-images (PDF, etc.) or fallback
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-black/5 dark:border-white/5 max-w-sm ${isUploading ? "opacity-70" : ""}`}>
      <div className="p-2 bg-white dark:bg-zinc-700 rounded-lg text-zinc-500 dark:text-zinc-400">
        <FileText size={24} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate text-zinc-900 dark:text-zinc-100" title={finalName}>
          {finalName}
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">
          {finalType.split("/")[1]?.toUpperCase() || "FILE"}
        </div>
      </div>
      {!isUploading && finalUrl && (
        <a
          href={finalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
          title="Download"
        >
          <Download size={18} />
        </a>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          className="p-2 text-zinc-500 hover:text-red-500 transition-colors"
          title="Remove"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
