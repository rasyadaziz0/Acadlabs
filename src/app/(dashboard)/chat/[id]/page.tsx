"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import ChatMessage from "@/components/chat-message";
import SearchResults from "@/components/search-results";
import AiInput from "@/components/ui/ai-input";
import { handleFileUpload } from "@/lib/upload-client";
import { sanitizeUserText, sanitizeAIText, sanitizeSearchQuery } from "@/lib/sanitize";
import { generateChatTitleFromUserInput } from "@/lib/title";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  chat_id: string;
  user_id: string;
  created_at: string;
};

const dedupeAndSort = (arr: Message[]) => {
  const seen = new Set<string>();
  const out: Message[] = [];
  for (const m of arr) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      out.push(m);
    }
  }
  return out.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
};

// Keep only the last N messages in UI memory to prevent OOM
const HISTORY_LIMIT = 50;
function clampLastNMessages(arr: Message[], n: number): Message[] {
  return arr.length <= n ? arr : arr.slice(arr.length - n);
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState<number>(160);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  // Streaming state: use DOM refs to avoid keeping huge strings in React state
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const streamingContainerRef = useRef<HTMLDivElement>(null);
  const streamingTextNodeRef = useRef<Text | null>(null);
  const shouldAutoScrollRef = useRef<boolean>(true);
  const [shareSlug, setShareSlug] = useState<string | undefined>(undefined);

  const supabase = useMemo(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  , []);

  useEffect(() => {
    const fetchMessages = async () => {
      setInitialLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setInitialLoading(false);
        return;
      }

      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", id)
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: true });

      if (data) {
        setMessages((prev) => {
          const map = new Map(prev.map((m) => [m.id, m] as const));
          for (const m of data as Message[]) map.set(m.id, m as Message);
          const merged = Array.from(map.values());
          const sorted = dedupeAndSort(merged);
          const clamped = clampLastNMessages(sorted, HISTORY_LIMIT);
          return clamped;
        });
      }
      setInitialLoading(false);
    };
    fetchMessages();
  }, [id, supabase]);

  useEffect(() => {
    const fetchShareSlug = async () => {
      if (!id) return;
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      const { data, error } = await supabase
        .from("chats")
        .select("share_slug")
        .eq("id", id)
        .eq("user_id", userData.user.id)
        .single();
      if (!error && data) setShareSlug((data as any).share_slug || undefined);
    };
    fetchShareSlug();
  }, [id, supabase]);

  const derivedChatTitle = useMemo(() => {
    try {
      const firstUser = [...messages].find((m) => m.role === "user")?.content || "";
      if (!firstUser) return "";
      const body = firstUser.replace(/^::attachment\[[^\]]+\]\s*\n?/, "");
      return generateChatTitleFromUserInput(body);
    } catch {
      return "";
    }
  }, [messages]);

  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom(isLoading ? "auto" : "smooth");
    }
  }, [messages, shouldAutoScroll, isLoading]);

  // Auto-scroll when streaming starts
  useEffect(() => {
    if (isStreaming && shouldAutoScroll) {
      scrollToBottom("auto");
    }
  }, [isStreaming, shouldAutoScroll]);

  useEffect(() => {
    const scroller = document.getElementById("app-scroll");
    if (!scroller) return;
    const handleScroll = () => {
      const threshold = 100;
      const atBottom =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < threshold;
      setShouldAutoScroll(atBottom);
      shouldAutoScrollRef.current = atBottom;
    };
    scroller.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => scroller.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const el = inputContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.ceil(entry.contentRect.height);
        setInputHeight(h);
      }
    });
    ro.observe(el);

    setInputHeight(Math.ceil(el.getBoundingClientRect().height));
    return () => ro.disconnect();
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  // Initialize/cleanup streaming DOM text node when streaming toggles
  useEffect(() => {
    const container = streamingContainerRef.current;
    if (isStreaming) {
      if (container) {
        container.textContent = "";
        const node = document.createTextNode("");
        container.appendChild(node);
        streamingTextNodeRef.current = node;
      }
    } else {
      if (container) container.textContent = "";
      streamingTextNodeRef.current = null;
    }
  }, [isStreaming]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let mounted = true;
    const setup = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!mounted || !userData.user) return;
      channel = supabase
        .channel(`realtime:messages:${id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${id}` },
          (payload) => {
            const row = payload.new as Message;
            if (!row || row.user_id !== userData.user!.id) return;
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === row.id);
              let next: Message[];
              if (idx !== -1) {
                next = prev.slice();
                next[idx] = { ...prev[idx], ...row } as Message;
              } else {
                next = [...prev, row];
              }
              const out = clampLastNMessages(dedupeAndSort(next), HISTORY_LIMIT);
              return out;
            });
          }
        )
        .subscribe();
    };
    setup();
    return () => {
      mounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [id, supabase]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const shouldPoll = messages.length === 0 || (!!last && last.role === "user");
    if (shouldPoll && !isPolling) {
      setIsPolling(true);
      pollingRef.current = setInterval(async () => {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const { data } = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", id)
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: true });
        if (data) {
          setMessages((prev) => {
            const map = new Map(prev.map((m) => [m.id, m] as const));
            for (const m of data as Message[]) map.set(m.id, m as Message);
            const merged = Array.from(map.values());
            const out = clampLastNMessages(dedupeAndSort(merged), HISTORY_LIMIT);
            return out;
          });
          const latest = data[data.length - 1];
          if (latest && latest.role === "assistant") {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            setIsPolling(false);
          }
        }
      }, 1500);
    }

    if (!shouldPoll && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
      setIsPolling(false);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [messages, id, supabase, isPolling]);

  const handleSearch = async (): Promise<any[]> => {
    if (!input.trim()) return [];

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: sanitizeSearchQuery(input) }),
      });
      const data = await response.json();
      const results = Array.isArray(data?.results) ? data.results : [];
      setSearchResults(results);
      return results;
    } catch (error) {
      console.error("Search error:", error);
      return [];
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() && !attachedFile) return;

    if (attachedFile && attachedFile.size > MAX_FILE_SIZE_BYTES) {
      toast.error("Ukuran file maksimal 10MB");
      setAttachedFile(null);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const query = input;
    const cleanQuery = sanitizeUserText(query);
    const hasFile = !!attachedFile;
    const attachmentMarker = hasFile
      ? (() => {
          const rawName = attachedFile!.name || "file";
          const rawType = attachedFile!.type || "application/octet-stream";
          const safeName = sanitizeUserText(rawName)
            .replace(/"/g, '\\"')
            .replace(/\n|\r/g, " ")
            .slice(0, 200);
          const safeType = sanitizeUserText(rawType)
            .replace(/"/g, '\\"')
            .replace(/\n|\r/g, " ")
            .slice(0, 100);
          const size = attachedFile!.size;
          return `::attachment[name="${safeName}",type="${safeType}",size=${size}]`;
        })()
      : "";
    const composed = hasFile ? `${attachmentMarker}\n${cleanQuery.trim()}` : cleanQuery.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: composed || (hasFile ? attachmentMarker : ""),
      chat_id: id,
      user_id: userData.user.id,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => clampLastNMessages([...prev, userMessage], HISTORY_LIMIT));
    setInput("");
    setIsLoading(true);

    let userPersisted = false;
    let streamMessageId: string | null = null;
    try {
      const { data: savedUser, error: userError } = await supabase
        .from("messages")
        .insert({
          role: "user",
          content: userMessage.content,
          chat_id: id,
          user_id: userData.user.id,
        })
        .select("*")
        .single();
      if (userError) throw userError;
      userPersisted = true;
      if (savedUser) {
        setMessages((prev) => {
          const mapped = prev.map((m) => (m.id === userMessage.id ? (savedUser as Message) : m));
          return clampLastNMessages(dedupeAndSort(mapped), HISTORY_LIMIT);
        });
      }

      if (hasFile) {
        const result = await handleFileUpload(attachedFile!);
        const safeAssistant = sanitizeAIText(result.content || "");
        const { error: assistantError } = await supabase
          .from("messages")
          .insert({
            role: "assistant",
            content: safeAssistant,
            chat_id: id,
            user_id: userData.user.id,
          });
        if (assistantError) throw assistantError;
      } else {
        // Optionally perform DeepSearch and capture fresh results
        let effectiveSearchResults: any[] = [];
        if (useSearch) {
          effectiveSearchResults = await handleSearch();
        }

        // Text-only chat flow with streaming (DOM-based to reduce memory)
        setIsStreaming(true);
        // Prepare optimistic assistant placeholder
        streamMessageId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
          ? crypto.randomUUID()
          : `assistant-${Date.now()}`;
        const optimisticAssistant: Message = {
          id: streamMessageId,
          role: "assistant",
          content: "",
          chat_id: id,
          user_id: userData.user.id,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => {
          const next = clampLastNMessages([...prev, optimisticAssistant], HISTORY_LIMIT);
          return next;
        });

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            messages: [...messages, userMessage],
            // Use the fresh results captured above to avoid stale state
            searchResults: useSearch ? effectiveSearchResults : [],
          }),
        });

        if (!response.ok || !response.body) {
          const msg = await response.text().catch(() => "Failed to get AI response");
          throw new Error(msg || "Failed to get AI response");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let doneReading = false;

        let pendingChunk = "";
        const finalChunks: string[] = [];
        let rafPending = false;
        let lastFlushTs = 0;
        const FLUSH_MIN_INTERVAL_MS = 33; // ~30 FPS
        const MIN_CHARS_BEFORE_FORCED_FLUSH = 64;
        const scheduleFlush = () => {
          if (rafPending) return;
          rafPending = true;
          const tick = () => {
            const now = performance.now();
            const shouldFlush =
              now - lastFlushTs >= FLUSH_MIN_INTERVAL_MS || pendingChunk.length >= MIN_CHARS_BEFORE_FORCED_FLUSH;
            if (!shouldFlush) {
              requestAnimationFrame(tick);
              return;
            }
            if (pendingChunk) {
              // Append to DOM text node to avoid React state churn
              if (streamingTextNodeRef.current) {
                streamingTextNodeRef.current.appendData(pendingChunk);
              }
              const apply = pendingChunk;
              finalChunks.push(apply);
              pendingChunk = "";
              lastFlushTs = now;
              if (shouldAutoScrollRef.current) {
                scrollToBottom("auto");
              }
              // Incrementally update React state as well (optimistic assistant)
              if (streamMessageId) {
                setMessages((prev) => {
                  const idx = prev.findIndex((m) => m.id === streamMessageId);
                  if (idx === -1) return prev;
                  const next = prev.slice();
                  next[idx] = { ...prev[idx], content: prev[idx].content + apply } as Message;
                  return next;
                });
              }
            }
            rafPending = false;
          };
          requestAnimationFrame(tick);
        };

        while (!doneReading) {
          const { value, done } = await reader.read();
          doneReading = done;
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
                doneReading = true;
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
              }
            }
          }
        }

        // Final flush
        if (pendingChunk) {
          if (streamingTextNodeRef.current) {
            streamingTextNodeRef.current.appendData(pendingChunk);
          }
          finalChunks.push(pendingChunk);
          pendingChunk = "";
          if (shouldAutoScrollRef.current) {
            scrollToBottom("auto");
          }
        }

        // Persist final assistant message; use the same streamMessageId
        const finalText = sanitizeAIText(finalChunks.join("").trim());
        if (finalText.length > 0) {
          const insertPayload: any = {
            role: "assistant",
            content: finalText,
            chat_id: id,
            user_id: userData.user.id,
          };
          if (streamMessageId) insertPayload.id = streamMessageId;
          const { data: savedAssistant, error: assistantError } = await supabase
            .from("messages")
            .insert(insertPayload)
            .select("*")
            .single();
          if (assistantError) throw assistantError;
          // Ensure local state reflects final content (in case Realtime lags)
          if (streamMessageId) {
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === streamMessageId);
              if (idx === -1) return prev;
              const next = prev.slice();
              next[idx] = { ...prev[idx], content: finalText } as Message;
              return next;
            });
          }
        }
      }

      if (messages.length === 0) {
        const newTitle = generateChatTitleFromUserInput(query);
        await supabase
          .from("chats")
          .update({ title: newTitle })
          .eq("id", id)
          .eq("user_id", userData.user.id);
      }
      setAttachedFile(null);
    } catch (error) {
      console.error("Error:", error);
      if (!userPersisted) {
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      }
      const errText = (error instanceof Error ? error.message : "Sorry, there was an error processing your request.");
      setMessages((prev) => {
        const next = prev.slice();
        const idx = next.findIndex((m) => m.role === 'assistant' && m.chat_id === id && m.user_id === userData.user.id && m.content !== undefined);
        if (idx !== -1) {
          next[idx] = { ...next[idx], content: errText } as Message;
          return clampLastNMessages(next, HISTORY_LIMIT);
        }
        return clampLastNMessages(
          [
            ...prev,
            {
              id: Date.now().toString() + "-err",
              role: "assistant",
              content: errText,
              chat_id: id,
              user_id: userData.user.id,
              created_at: new Date().toISOString(),
            },
          ],
          HISTORY_LIMIT
        );
      });
    } finally {
      setIsLoading(false);
      setSearchResults([]);
      setIsStreaming(false);
      const container = streamingContainerRef.current;
      if (container) container.textContent = "";
      streamingTextNodeRef.current = null;
      setAttachedFile(null);
    }
  };

  const handleMessageUpdated = (updated: Message) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === updated.id);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = { ...prev[idx], ...updated } as Message;
      return clampLastNMessages(dedupeAndSort(next), HISTORY_LIMIT);
    });
  };

  const handleResendFromMessage = async (edited: Message) => {
    try {
      if (!edited || edited.role !== 'user') return;
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const chatId = edited.chat_id;
      if (!chatId) return;

      const idx = messages.findIndex((m) => m.id === edited.id);
      if (idx === -1) return;
      const history = dedupeAndSort(messages.slice(0, idx + 1).map((m) => (m.id === edited.id ? edited : m)));

      setIsStreaming(true);

      const streamMessageId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `assistant-${Date.now()}`;
      const optimisticAssistant: Message = {
        id: streamMessageId,
        role: 'assistant',
        content: '',
        chat_id: chatId,
        user_id: userData.user.id,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => {
        const cut = prev.findIndex((m) => m.id === edited.id);
        const base = cut !== -1 ? prev.slice(0, cut + 1) : prev;
        return clampLastNMessages([...base, optimisticAssistant], HISTORY_LIMIT);
      });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ messages: history, searchResults: [] }),
      });
      if (!response.ok || !response.body) {
        const msg = await response.text().catch(() => 'Failed to get AI response');
        throw new Error(msg || 'Failed to get AI response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;
      let pendingChunk = '';
      const finalChunks: string[] = [];
      let rafPending = false;
      let lastFlushTs = 0;
      const FLUSH_MIN_INTERVAL_MS = 33;
      const MIN_CHARS_BEFORE_FORCED_FLUSH = 64;
      const scheduleFlush = () => {
        if (rafPending) return;
        rafPending = true;
        const tick = () => {
          const now = performance.now();
          const shouldFlush = now - lastFlushTs >= FLUSH_MIN_INTERVAL_MS || pendingChunk.length >= MIN_CHARS_BEFORE_FORCED_FLUSH;
          if (!shouldFlush) { requestAnimationFrame(tick); return; }
          if (pendingChunk) {
            if (streamingTextNodeRef.current) streamingTextNodeRef.current.appendData(pendingChunk);
            const apply = pendingChunk;
            finalChunks.push(apply);
            pendingChunk = '';
            lastFlushTs = now;
            if (shouldAutoScrollRef.current) scrollToBottom('auto');
            setMessages((prev) => {
              const i = prev.findIndex((m) => m.id === streamMessageId);
              if (i === -1) return prev;
              const next = prev.slice();
              next[i] = { ...prev[i], content: prev[i].content + apply } as Message;
              return next;
            });
          }
          rafPending = false;
        };
        requestAnimationFrame(tick);
      };

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) buffer += decoder.decode(value, { stream: true });
        let j: number;
        while ((j = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, j);
          buffer = buffer.slice(j + 2);
          const dataLines = rawEvent.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
          for (const data of dataLines) {
            if (!data) continue;
            if (data === '[DONE]') { done = true; break; }
            try {
              const json = JSON.parse(data);
              const delta = json?.choices?.[0]?.delta;
              const token: string = typeof delta?.content === 'string' ? delta.content : (json?.choices?.[0]?.text as string) || '';
              if (token) { pendingChunk += token; scheduleFlush(); }
            } catch {}
          }
        }
      }

      if (pendingChunk) {
        if (streamingTextNodeRef.current) streamingTextNodeRef.current.appendData(pendingChunk);
        finalChunks.push(pendingChunk);
        pendingChunk = '';
        if (shouldAutoScrollRef.current) scrollToBottom('auto');
      }

      const finalText = sanitizeAIText(finalChunks.join('').trim());
      if (finalText.length > 0) {
        const { error: assistantError } = await supabase
          .from('messages')
          .insert({ id: streamMessageId, role: 'assistant', content: finalText, chat_id: chatId, user_id: userData.user.id });
        if (assistantError) throw assistantError;
        setMessages((prev) => {
          const i = prev.findIndex((m) => m.id === streamMessageId);
          if (i === -1) return prev;
          const next = prev.slice();
          next[i] = { ...prev[i], content: finalText } as Message;
          return next;
        });
      }
    } catch (e) {
      console.error('Resend error:', e);
      toast.error('Gagal mengirim ulang balasan');
    } finally {
      setIsStreaming(false);
      const container = streamingContainerRef.current; if (container) container.textContent = '';
      streamingTextNodeRef.current = null;
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div
        id="app-scroll"
        className="flex flex-1 flex-col px-2 py-4 sm:px-4 mx-auto w-full max-w-[740px]"
        style={{ paddingBottom: (inputHeight ?? 0) + 16 }}
      >
        <AnimatePresence initial={false}>
          {initialLoading ? (
            <div className="space-y-3 sm:space-y-4">
              <div className="h-4 w-1/3 rounded bg-muted/50 animate-pulse" />
              <div className="h-24 w-full rounded bg-muted/50 animate-pulse" />
              <div className="h-4 w-2/5 rounded bg-muted/50 animate-pulse" />
            </div>
          ) : messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-1 flex-col items-center justify-center text-center"
            >
              <h2 className="mb-2 text-2xl font-bold flex items-center">
                Welcome to <span className="ml-2 text-yellow-500">Acadlabs</span>
              </h2>
              <p className="mb-8 text-muted-foreground">
                Mulai ngobrol dengan personal AI kamu.
              </p>
            </motion.div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} chatTitle={derivedChatTitle} shareSlug={shareSlug} onMessageUpdated={handleMessageUpdated} onResend={handleResendFromMessage} />
              ))}
              {isStreaming && (
                <div className="w-full">
                  <div
                    ref={streamingContainerRef}
                    className="prose dark:prose-invert w-full max-w-[72ch] min-w-0 break-words text-[15px] sm:text-[16px] leading-relaxed whitespace-pre-wrap"
                  />
                  <motion.span
                    aria-hidden
                    initial={{ opacity: 0.25 }}
                    animate={{ opacity: [0.25, 1, 0.25] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="ml-0.5 inline-block align-[-0.15em] w-[8px] h-[1em] bg-current/70 rounded-sm"
                  />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </AnimatePresence>

        {searchResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="my-4"
          >
            <SearchResults results={searchResults} />
          </motion.div>
        )}
      </div>

      <div ref={inputContainerRef} className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:pl-[var(--content-left)] ">
        <form onSubmit={handleSubmit} className="pointer-events-auto mx-auto w-full max-w-[740px] p-2 pb-[env(safe-area-inset-bottom,0px)]">
          <AiInput
            value={input}
            onChange={setInput}
            onSubmit={() => handleSubmit()}
            showSearch={useSearch}
            onSearchToggle={() => setUseSearch(!useSearch)}
            isLoading={isLoading}
            useSearch={useSearch}
            onFileSelected={setAttachedFile}
            attachedFile={attachedFile}
          />
        </form>
      </div>
    </div>
  );
}