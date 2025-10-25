"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import MarkdownRenderer from "./markdown/MarkdownRenderer";
import AttachmentPreview, { type AttachmentMeta } from "./AttachmentPreview";
import ShareButtons from "./share/ShareButtons";
import { Copy, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { createBrowserClient } from "@supabase/ssr";
import { sanitizeUserText } from "@/lib/sanitize";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  chat_id: string;
  user_id: string;
  created_at: string;
};

export type ChatMessageProps = { message?: Message; showCaret?: boolean; isStreaming?: boolean; chatTitle?: string; onMessageUpdated?: (m: Message) => void; onResend?: (m: Message) => void };

const parseAttachmentMarker = (text: string): { meta?: AttachmentMeta; body: string } => {
  if (!text) return { body: "" };
  const re = /^::attachment\[([^\]]+)\]\s*\n?/;
  const m = text.match(re);
  if (!m) return { body: text };
  const kv = m[1].split(/\s*,\s*/).map((p) => p.split("=").map((s) => s.trim())) as [string, string][];
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

function ChatMessage({ message, showCaret = false, isStreaming = false, chatTitle, onMessageUpdated, onResend }: ChatMessageProps) {
  if (!message) return null;

  const { meta: attachment, body } = useMemo(() => parseAttachmentMarker(message.content), [message.content]);
  const [normalizedForShare, setNormalizedForShare] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string>(body);
  const [saving, setSaving] = useState(false);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const composeAttachmentMarker = (meta?: AttachmentMeta) => {
    if (!meta || !meta.name) return "";
    const rawName = meta.name || "file";
    const rawType = meta.type || "application/octet-stream";
    const safeName = sanitizeUserText(rawName).replace(/"/g, '\\"').replace(/\n|\r/g, " ").slice(0, 200);
    const safeType = sanitizeUserText(rawType).replace(/"/g, '\\"').replace(/\n|\r/g, " ").slice(0, 100);
    const size = Number(meta.size || 0);
    return `::attachment[name="${safeName}",type="${safeType}",size=${size}]`;
  };

  const handleCopy = async () => {
    const text = body || "";
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
    const newContent = `${attachment && attachment.name ? composeAttachmentMarker(attachment) + (clean ? "\n" : "") : ""}${clean}`;
    try {
      setSaving(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user || userData.user.id !== message.user_id) {
        toast.error("Tidak bisa mengedit pesan ini");
        return;
      }
      const { data: updated, error } = await supabase
        .from("messages")
        .update({ content: newContent })
        .eq("id", message.id)
        .eq("user_id", userData.user.id)
        .select("*")
        .single();
      if (error) throw error;
      onMessageUpdated?.(updated as Message);
      onResend?.(updated as Message);
      setIsEditing(false);
      toast.success("Pesan diperbarui");
    } catch (e) {
      toast.error("Gagal menyimpan perubahan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex w-full justify-start">
        <div className={`w-full flex items-start gap-3 sm:gap-4 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
          <div className="flex-1 min-w-0">
            {message.role === "assistant" ? (
              <div className="w-full">
                <div className="prose dark:prose-invert w-full max-w-[72ch] min-w-0 break-words text-[15px] sm:text-[16px] leading-relaxed prose-headings:tracking-tight prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-2 prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:my-[6px] prose-strong:font-semibold prose-a:no-underline hover:prose-a:underline prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-ul:my-[6px] prose-ol:my-[6px] prose-li:my-1 prose-li:marker:text-zinc-500 dark:prose-li:marker:text-zinc-400 prose-pre:rounded-lg prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 prose-hr:border-zinc-200 dark:prose-hr:border-zinc-800 prose-blockquote:border-l-4 prose-blockquote:border-zinc-300 dark:prose-blockquote:border-zinc-700 prose-blockquote:pl-4 prose-blockquote:italic">
                  <MarkdownRenderer content={body} role={message.role} isStreaming={isStreaming} onNormalizedChange={setNormalizedForShare} />
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

                <ShareButtons content={normalizedForShare} chatTitle={chatTitle} />
              </div>
            ) : (
              <div className="ml-auto w-fit max-w-[85%] sm:max-w-[70%] group">
                <div className="rounded-2xl bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50 px-4 py-2.5 shadow-sm relative">
                  <AttachmentPreview meta={attachment} />

                  {isEditing ? (
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
                          onClick={() => { setIsEditing(false); setDraft(body); }}
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
                  ) : (
                    <div className="text-[14px] sm:text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                      <MarkdownRenderer content={body} role={message.role} isStreaming={isStreaming} />
                    </div>
                  )}
                </div>
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
                      onClick={() => { setIsEditing(true); setDraft(body); }}
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
