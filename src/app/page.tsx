"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import AiInput from "@/components/ui/ai-input";
import ChatMessage from "@/components/chat-message";
import { handleFileUpload } from "@/lib/upload-client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export default function Home() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // State for preview chat
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [useSearchMode, setUseSearchMode] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileAlertTimerRef = useRef<number | null>(null);
  const [streamingIndex, setStreamingIndex] = useState<number | null>(null);

  const MAX_PREVIEW_QUESTIONS = 2;
  const [isLimitOpen, setIsLimitOpen] = useState(false);
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

  const handleSend = async (overrideText?: string) => {
    const raw = typeof overrideText === "string" ? overrideText : input;
    const text = raw.trim();
    if ((isLoading) || (!text && !attachedFile)) return;

    if (questionCount >= MAX_PREVIEW_QUESTIONS) {
      setIsLimitOpen(true);
      return;
    }

    // Validate file size again client-side
    if (attachedFile && attachedFile.size > MAX_FILE_SIZE_BYTES) {
      // keep UX similar to AiInput
      // do not import toast here to avoid new dependency; simply don't send
      setAttachedFile(null);
      return;
    }

    const hasFile = !!attachedFile;
    const attachmentMarker = hasFile
      ? `::attachment[name="${attachedFile!.name}",type="${attachedFile!.type || "application/octet-stream"}",size=${attachedFile!.size}]`
      : "";
    const composed = hasFile ? `${attachmentMarker}\n${text}`.trim() : text;

    const nextMessages = [...messages, { role: "user" as const, content: composed }];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    try {
      if (hasFile) {
        // Use unified upload pipeline (images → /api/analyze, docs → /api/upload)
        const result = await handleFileUpload(attachedFile!);
        setMessages((prev) => [...prev, { role: "assistant", content: result.content }]);
      } else {
        // Streaming SSE flow for preview chat
        // 1) Add provisional assistant message and remember its index
        const tempIndex = nextMessages.length; // assistant will be appended after user message
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
        setStreamingIndex(tempIndex);

        // 2) Call streaming API
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ messages: nextMessages }),
        });
        if (!response.ok || !response.body) {
          const text = await response.text().catch(() => "Failed to get response");
          throw new Error(text || "Failed to get response");
        }

        // 3) Read and parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;

        // Buffer tokens and flush via rAF to reduce re-renders
        let pendingChunk = "";
        let displayed = "";
        let rafPending = false;
        const scheduleFlush = () => {
          if (rafPending) return;
          rafPending = true;
          requestAnimationFrame(() => {
            if (pendingChunk) {
              displayed += pendingChunk;
              pendingChunk = "";
              setMessages((prev) =>
                prev.map((m, i) => (i === tempIndex ? { ...m, content: displayed } : m))
              );
            }
            rafPending = false;
          });
        };

        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) buffer += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);

            const dataLines = rawEvent
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim());

            for (const data of dataLines) {
              if (!data) continue;
              if (data === "[DONE]") {
                done = true;
                break;
              }
              try {
                const json = JSON.parse(data);
                const delta = json?.choices?.[0]?.delta;
                const token: string =
                  typeof delta?.content === "string"
                    ? delta.content
                    : (json?.choices?.[0]?.text as string) || "";
                if (token) {
                  pendingChunk += token;
                  scheduleFlush();
                }
              } catch {
                // ignore keep-alives/comments
              }
            }
          }
        }
        // Final flush to ensure any pending chunk is rendered
        if (pendingChunk) {
          setMessages((prev) =>
            prev.map((m, i) => (i === tempIndex ? { ...m, content: displayed + pendingChunk } : m))
          );
          displayed += pendingChunk;
          pendingChunk = "";
        }
      }
      const newCount = questionCount + 1;
      setQuestionCount(newCount);
      if (newCount >= MAX_PREVIEW_QUESTIONS) {
        // Tampilkan dialog login 5 detik setelah jawaban kedua
        if (fileAlertTimerRef.current) window.clearTimeout(fileAlertTimerRef.current);
        fileAlertTimerRef.current = window.setTimeout(() => setIsLimitOpen(true), 5000);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Maaf, terjadi kesalahan. Coba lagi nanti." },
      ]);
    } finally {
      setIsLoading(false);
      setAttachedFile(null);
      setStreamingIndex(null);
    }
  };

  // Cleanup any scheduled alert timer on unmount
  useEffect(() => {
    return () => {
      if (fileAlertTimerRef.current) window.clearTimeout(fileAlertTimerRef.current);
    };
  }, []);

  // Jika sudah login, redirect ke /dashboard
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        router.replace("/dashboard");
      }
    };
    checkSession();
  }, [router, supabase]);

  // Track whether user is near the bottom of the preview scroll container
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 100; // px from bottom to consider "at bottom"
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      setShouldAutoScroll(atBottom);
    };
    el.addEventListener('scroll', handleScroll);
    // Initialize state based on current position
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  };

  // ChatGPT-like auto-scroll: only when near bottom; disable smooth during streaming
  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom(isLoading ? 'auto' : 'smooth');
    }
  }, [messages, shouldAutoScroll, isLoading]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-background px-4 pb-4 pt-24 sm:pt-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full text-center flex flex-col items-center flex-1"
      >
        <h1 className="mb-4 text-2xl sm:text-3xl font-bold text-yellow-500">Acadlabs</h1>
        <p className="mb-6 text-sm text-muted-foreground">Ask anything</p>
        {/* Input moved to bottom like ChatGPT */}

        {/* Quick Actions */}
        <div className="flex flex-wrap justify-center gap-2 mb-6 sm:mb-8">
          {[
            { label: "Summarize text", text: "Ringkas teks berikut menjadi poin-poin yang jelas: " },
            { label: "Surprise me", text: "Beri aku ide seru/unik untuk dicoba hari ini: " },
            { label: "Make a plan", text: "Buatkan rencana langkah demi langkah untuk: " },
            { label: "Brainstorm", text: "Brainstorm 10 ide terkait: " },
            { label: "Analyze data", text: "Bantu analisis data berikut dan berikan insight: " },
          ].map((item, i) => (
            <Button
              key={i}
              variant="ghost"
              size="sm"
              onClick={() => setInput(item.text)}
              className="rounded-full ring-1 ring-black/10 dark:ring-white/10 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 text-foreground"
              title={item.label}
            >
              {item.label}
            </Button>
          ))}
        </div>

        {/* Messages */}
        <div className="mx-auto mb-2 max-w-2xl w-full text-left flex-1 min-h-0">
          <div
            ref={listRef}
            className="h-full w-full overflow-y-auto px-3 pt-3 pb-24 space-y-3"
          >
            {messages.map((m, i) => (
              <ChatMessage
                key={i}
                message={{
                  id: String(i),
                  role: m.role as any,
                  content: m.content,
                  chat_id: "preview",
                  user_id: "preview",
                  created_at: new Date().toISOString(),
                } as any}
                showCaret={isLoading && streamingIndex === i}
                isStreaming={isLoading && streamingIndex === i}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground text-center">
            Preview: {questionCount}/{MAX_PREVIEW_QUESTIONS} pertanyaan digunakan. Login untuk akses penuh.
          </p>
        </div>

        {/* Input at bottom */}
        <div className="mx-auto mt-4 max-w-2xl w-full sticky bottom-2 sm:bottom-4 z-10 mb-[env(safe-area-inset-bottom)] text-left">
          <AiInput
            className="w-full text-left"
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            isLoading={isLoading}
            useSearch={useSearchMode}
            showSearch={useSearchMode}
            onSearchToggle={() => setUseSearchMode((v) => !v)}
            onFileSelected={setAttachedFile}
            attachedFile={attachedFile}
          />
        </div>
      </motion.div>
      {/* Preview limit alert dialog */}
      <AlertDialog open={isLimitOpen} onOpenChange={setIsLimitOpen}>
        <AlertDialogContent className="sm:max-w-md border-0 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Selamat datang di Acadlabs</AlertDialogTitle>
            <AlertDialogDescription>
              Silahkan login Untuk Mendapatkan Fitur Lengkap nya
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsLimitOpen(false)}>
              Nanti
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => router.push("/login")}>
              Login sekarang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
