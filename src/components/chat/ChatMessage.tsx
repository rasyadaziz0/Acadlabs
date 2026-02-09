"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import MarkdownRenderer from "./markdown/MarkdownRenderer";
import AttachmentPreview from "./AttachmentPreview";
import ShareButtons from "./share/ShareButtons";
import { Copy, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { sanitizeUserText } from "@/lib/sanitize";
import { parseAttachmentMarker, composeAttachmentMarker } from "@/lib/message-parser"; // Keep for now, might be used in handleSave if we decide to re-add markers for legacy
import { useMessageActions } from "@/hooks/useMessageActions";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  chat_id: string;
  user_id: string;
  created_at: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
};

export type ChatMessageProps = { message?: Message; showCaret?: boolean; isStreaming?: boolean; chatTitle?: string; shareSlug?: string; onMessageUpdated?: (m: Message) => void; onResend?: (m: Message) => void };



function ChatMessage({ message, showCaret = false, isStreaming = false, chatTitle, shareSlug, onMessageUpdated, onResend }: ChatMessageProps) {
  if (!message) return null;

  // 1. Resolve Attachment Data
  const { url: attachmentUrl, type: attachmentType, isImage } = useMemo(() => {
    if (message.attachment_url) {
      return {
        url: message.attachment_url,
        type: message.attachment_type || "application/octet-stream",
        isImage: message.attachment_type?.startsWith("image/")
      };
    }

    // Fallback: Markdown Pattern for legacy embedded images
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/;
    const match = message.content.match(imgRegex);
    if (match) {
      return { url: match[2], type: "image/png", isImage: true };
    }

    return { url: null, type: null, isImage: false };
  }, [message.attachment_url, message.attachment_type, message.content]);

  // 2. Clean Content (Remove Image Markdown if we found an image)
  const cleanContent = useMemo(() => {
    if (attachmentUrl && isImage) {
      // Remove markdown image syntax if it exists in content
      return message.content.replace(/!\[([^\]]*)\]\(([^)]+)\)/, "").trim();
    }
    return message.content;
  }, [message.content, attachmentUrl, isImage]);

  const [normalizedForShare, setNormalizedForShare] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string>(cleanContent);
  const { updateMessageContent, saving } = useMessageActions();

  const handleCopy = async () => {
    const text = cleanContent || "";
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success("Tersalin");
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  const handleSave = async () => {
    if (saving) return;
    const clean = sanitizeUserText(draft || "").trim();
    const newContent = clean;
    try {
      const updated = await updateMessageContent(message.id, message.user_id, newContent);
      onMessageUpdated?.(updated as Message);
      onResend?.(updated as Message);
      setIsEditing(false);
      toast.success("Pesan diperbarui");
    } catch {
      // toast handled in hook
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex w-full justify-start">
        <div className="w-full flex items-start gap-3 sm:gap-4 flex-row">
          <div className={`flex-1 min-w-0 flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>

            {/* User Message */}
            {message.role === "user" && (
              <div className="flex flex-col items-end max-w-[85%] sm:max-w-[70%]">
                {(cleanContent || isEditing) && (
                  <div className="bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50 px-4 py-2.5 rounded-2xl shadow-sm relative group w-fit">
                    {!isEditing ? (
                      <div className="text-[14px] sm:text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                        <MarkdownRenderer content={cleanContent} role={message.role} isStreaming={isStreaming} />
                      </div>
                    ) : (
                      <div className="mt-1 relative">
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={4}
                          className="w-full bg-transparent text-[15px] sm:text-[16px] leading-relaxed p-0 pr-24 pb-12 outline-none resize-none"
                          autoFocus
                        />
                        <div className="absolute bottom-2 right-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setIsEditing(false); setDraft(cleanContent); }}
                            className="px-3 py-1.5 rounded-full text-sm bg-black/10 hover:bg-black/15 text-current dark:bg-white/10 dark:hover:bg-white/15"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="px-3 py-1.5 rounded-full text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-60"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Attachment Preview Below Text */}
                {attachmentUrl && (
                  <div className="mt-2 self-end">
                    <AttachmentPreview
                      url={attachmentUrl}
                      type={attachmentType || "file"}
                      name="Attachment" // We don't have name stored in DB yet, unfortunately.
                    />
                  </div>
                )}

                {!isEditing && (
                  <div className="mt-1 flex items-center justify-end gap-2 text-zinc-600 dark:text-zinc-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10"
                      aria-label="Copy"
                      title="Copy"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsEditing(true); setDraft(cleanContent); }}
                      className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10"
                      aria-label="Edit"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {message.role === "assistant" ? (
              <div className="w-full">
                <div className="prose dark:prose-invert w-full max-w-[72ch] min-w-0 break-words text-[15px] leading-relaxed prose-headings:tracking-tight prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-2 prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:leading-7 prose-li:leading-7 prose-p:my-[6px] prose-strong:font-semibold prose-a:no-underline hover:prose-a:underline prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-ul:my-[6px] prose-ol:my-[6px] prose-li:my-1 prose-li:marker:text-zinc-500 dark:prose-li:marker:text-zinc-400 prose-pre:rounded-lg prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 prose-hr:border-zinc-200 dark:prose-hr:border-zinc-800 prose-blockquote:border-l-4 prose-blockquote:border-zinc-300 dark:prose-blockquote:border-zinc-700 prose-blockquote:pl-4 prose-blockquote:italic">
                  <MarkdownRenderer content={message.content} role={message.role} isStreaming={isStreaming} onNormalizedChange={setNormalizedForShare} />
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

                <ShareButtons content={normalizedForShare} chatTitle={chatTitle} shareSlug={shareSlug} chatId={message.chat_id} messageId={message.id} />
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>
    </>
  );
}

export default React.memo(ChatMessage, (prev, next) => {
  const a = prev.message;
  const b = next.message;
  const sameMsg = a?.id === b?.id && a?.content === b?.content && a?.role === b?.role;
  return sameMsg && prev.showCaret === next.showCaret && prev.isStreaming === next.isStreaming;
});
