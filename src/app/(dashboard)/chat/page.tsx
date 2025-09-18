"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import ChatMessage from "@/components/chat-message";
import SearchResults from "@/components/search-results";
import AiInput from "@/components/ui/ai-input";
import { handleFileUpload } from "@/lib/upload-client";
import { sanitizeUserText, sanitizeAIText, sanitizeSearchQuery } from "@/lib/sanitize";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  chat_id: string;
  user_id: string;
  created_at: string;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// Keep only the last N messages in UI memory to prevent OOM
const HISTORY_LIMIT = 50;
function clampLastNMessages(arr: Message[], n: number): Message[] {
  return arr.length <= n ? arr : arr.slice(arr.length - n);
}

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

export default function ChatPage() {
  // Pada halaman chat utama, id mungkin undefined
  const params = useParams<{ id?: string }>();
  const id = params?.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isCodeRequest, setIsCodeRequest] = useState(false);
  // Track input footer height to avoid overlap with messages
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState<number>(160);
  const contentRef = useRef<HTMLDivElement>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  // Streaming state: use DOM refs to avoid keeping huge strings in React state
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const streamingContainerRef = useRef<HTMLDivElement>(null);
  const streamingTextNodeRef = useRef<Text | null>(null);
  const shouldAutoScrollRef = useRef<boolean>(true);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );
  const router = useRouter();

  useEffect(() => {
    // On the index route (/chat), there is no id. Skip fetching without logging an error.
    if (!id) return;

    const fetchMessages = async () => {
      try {
        // Fetch user ID from session
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) {
          console.error("Error fetching user:", JSON.stringify(userError));
          return;
        }
        if (!userData.user) {
          console.error("No authenticated user found");
          return;
        }
        
        // Check if the chat exists and belongs to the user
        const { data: chatData, error: chatError } = await supabase
          .from("chats")
          .select("id")
          .eq("id", id as string)
          .eq("user_id", userData.user.id)
          .single();
          
        if (chatError) {
          console.error("Error verifying chat:", JSON.stringify(chatError));
          return;
        }
        
        // Fetch messages for the chat
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", id as string)
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: true });

        if (!error && data) {
          setMessages((prev) => {
            const map = new Map(prev.map((m) => [m.id, m] as const));
            for (const m of data as Message[]) map.set(m.id, m as Message);
            const merged = Array.from(map.values());
            const out = clampLastNMessages(dedupeAndSort(merged), HISTORY_LIMIT);
            console.log('[FETCH] fetchMessages merged', { prevLen: prev.length, fetched: (data as Message[]).length, out: out.length });
            return out;
          });
        } else if (error) {
          console.error("Error fetching messages:", JSON.stringify(error));
        }
      } catch (err) {
        console.error("Error in fetchMessages:", err instanceof Error ? err.message : JSON.stringify(err));
      }
    };

    fetchMessages();
  }, [id, supabase]);

  // Realtime updates for new messages (INSERT-only) when an id exists
  useEffect(() => {
    if (!id) return; // only subscribe when we have a chat id
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let mounted = true;
    const setup = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!mounted || !userData.user) return;
      console.log('[SUPABASE] subscribe messages INSERT', { chatId: id });
      channel = supabase
        .channel(`realtime:messages:${id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${id}` },
          (payload) => {
            console.log('[SUPABASE] subscription event', payload);
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
              console.log('[MESSAGES] setMessages: prevLen->newLen', prev.length, out.length);
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
        console.log('[SUPABASE] unsubscribe channel', { chatId: id });
        supabase.removeChannel(channel);
      }
    };
  }, [id, supabase]);

  useEffect(() => {
    if (shouldAutoScroll) scrollToBottom(isLoading ? "auto" : "smooth");
  }, [messages, shouldAutoScroll, isLoading]);

  // Auto-scroll when streaming starts
  useEffect(() => {
    if (isStreaming && shouldAutoScroll) {
      scrollToBottom("auto");
    }
  }, [isStreaming, shouldAutoScroll]);

  // Track whether user is near the bottom of the <main id="app-scroll"> container
  useEffect(() => {
    const scroller = document.getElementById('app-scroll');
    if (!scroller) return;
    const handleScroll = () => {
      const threshold = 100; // px from bottom to consider "at bottom"
      const atBottom =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < threshold;
      setShouldAutoScroll(atBottom);
      shouldAutoScrollRef.current = atBottom;
    };
    scroller.addEventListener('scroll', handleScroll);
    // Initialize state based on current position
    handleScroll();
    return () => scroller.removeEventListener('scroll', handleScroll);
  }, []);

  // Observe input footer height changes and apply bottom padding to content
  useEffect(() => {
    const el = inputContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.ceil(entry.contentRect.height);
        setInputHeight(h);
      }
    });
    ro.observe(el);
    // Initialize immediately
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

  const handleSearch = async () => {
    if (!input.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sanitizeSearchQuery(input) }),
      });

      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() && !attachedFile) return;

    // Guard oversize files (10MB) before any network work
    if (attachedFile && attachedFile.size > MAX_FILE_SIZE_BYTES) {
      toast.error("Ukuran file maksimal 10MB");
      setAttachedFile(null);
      return;
    }

    // Get user ID from session
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    
    const query = input; // original
    const cleanQuery = sanitizeUserText(query);
    const hasFile = !!attachedFile;
    const attachmentMarker = hasFile
      ? (() => {
          const rawName = attachedFile!.name || "file";
          const rawType = attachedFile!.type || "application/octet-stream";
          const safeName = sanitizeUserText(rawName).replace(/"/g, '\\"').replace(/\n|\r/g, " ").slice(0, 200);
          const safeType = sanitizeUserText(rawType).replace(/"/g, '\\"').replace(/\n|\r/g, " ").slice(0, 100);
          const size = attachedFile!.size;
          return `::attachment[name="${safeName}",type="${safeType}",size=${size}]`;
        })()
      : "";
    const composed = hasFile ? `${attachmentMarker}\n${cleanQuery.trim()}` : cleanQuery.trim();

    // Heuristic: detect if user is asking for code/syntax
    const looksLikeCodeRequest = (text: string) => {
      const t = text.toLowerCase();
      return /```/.test(text) ||
        /(code|syntax|snippet|contoh|implementasi|buatkan|generate)\b/.test(t) ||
        /(javascript|typescript|python|java|go|ruby|php|c\+\+|c#|dart|rust|kotlin|swift|sql|bash|shell|powershell|html|css|react|next\.?js|node\.?js)/.test(t);
    };
    setIsCodeRequest(looksLikeCodeRequest(cleanQuery));

    // If no chat id yet, create a chat first
    let chatId: string | undefined = id as string | undefined;
    if (!chatId) {
      const { data: newChat, error: chatError } = await supabase
        .from("chats")
        .insert({
          user_id: userData.user.id,
          message: "",
          role: "user",
        })
        .select("id")
        .single();
      if (chatError || !newChat) {
        console.error("Failed to create chat:", chatError?.message);
        return;
      }
      chatId = newChat.id as string;
      // Prefetch target route and navigate without scrolling to avoid flicker
      router.prefetch(`/chat/${chatId}`);
      router.push(`/chat/${chatId}`, { scroll: false });
    }

    // Add user message to UI immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: composed || (hasFile ? attachmentMarker : ""),
      chat_id: (chatId as string),
      user_id: userData.user.id,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => clampLastNMessages([...prev, userMessage], HISTORY_LIMIT));
    setInput("");

    // If search is enabled and no file, perform search
    if (useSearch && !hasFile) {
      await handleSearch();
    }

    setIsLoading(true);

    let userPersisted = false;
    let streamMessageId: string | null = null;
    try {
      // Save user message to database
      const { data: savedUserMessage, error: userError } = await supabase
        .from("messages")
        .insert({
          role: "user",
          content: userMessage.content,
          chat_id: (chatId as string),
          user_id: userData.user.id
        })
        .select()
        .single();
      if (userError) throw userError;
      userPersisted = true;
      if (savedUserMessage) {
        // Replace optimistic user message with persisted row to avoid duplication via Realtime
        setMessages((prev) => clampLastNMessages(prev.map((m) => (m.id === userMessage.id ? (savedUserMessage as Message) : m)), HISTORY_LIMIT));
      }

      if (hasFile) {
        // Attachment flow: send to unified upload pipeline
        const result = await handleFileUpload(attachedFile!);
        const safeAssistant = sanitizeAIText(result.content || "");
        const { error: assistantError } = await supabase
          .from("messages")
          .insert({
            role: "assistant",
            content: safeAssistant,
            chat_id: (chatId as string),
            user_id: userData.user.id
          });
        if (assistantError) throw assistantError;
      } else {
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
          chat_id: (chatId as string),
          user_id: userData.user.id,
          created_at: new Date().toISOString(),
        };
        setStreamingAssistantId(streamMessageId);
        setMessages((prev) => {
          const next = clampLastNMessages([...prev, optimisticAssistant], HISTORY_LIMIT);
          console.log('[MESSAGES] setMessages: prevLen->newLen', prev.length, next.length);
          return next;
        });

        // Call our streaming API
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            messages: [...messages, userMessage],
            searchResults: useSearch ? searchResults : [],
          }),
        });

        if (!response.ok || !response.body) {
          const msg = await response.text().catch(() => "Failed to get AI response");
          throw new Error(msg || "Failed to get AI response");
        }

        // Read SSE stream and append to DOM text node (rAF-throttled)
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;

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
              now - lastFlushTs >= FLUSH_MIN_INTERVAL_MS ||
              pendingChunk.length >= MIN_CHARS_BEFORE_FORCED_FLUSH;
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
                console.log('[STREAM] chunk:', apply.length, 'id:', streamMessageId);
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

        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events separated by double newlines
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);

            // Extract data lines
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
                    : (json?.choices?.[0]?.text as string) || ""; // fallback for completion-like payloads
                if (token) {
                  pendingChunk += token;
                  scheduleFlush();
                }
              } catch (e) {
                // ignore parse errors on keepalive/comments
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

        // Persist final assistant message using the same ID, then ensure local state updated
        const finalText = sanitizeAIText(finalChunks.join("").trim());
        if (finalText.length > 0) {
          const insertPayload: any = {
            role: "assistant",
            content: finalText,
            chat_id: (chatId as string),
            user_id: userData.user.id,
          };
          if (streamMessageId) insertPayload.id = streamMessageId;
          const { data: savedAssistant, error: assistantError } = await supabase
            .from("messages")
            .insert(insertPayload)
            .select("*")
            .single();
          console.log('[DB] insert message response', savedAssistant || assistantError);
          if (assistantError) throw assistantError;
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

      // Update chat title if it's the first message
      if (messages.length === 0) {
        await supabase
          .from("chats")
          .update({ title: cleanQuery.substring(0, 30) })
          .eq("id", chatId as string)
          .eq("user_id", userData.user.id);
      }

    } catch (error: any) {
      console.error("Chat submit error:", error?.message || error);
      // Add error message
      // Rollback optimistic user message if it failed to persist
      if (!userPersisted) {
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      }
      // If we had an optimistic assistant, turn it into an error message rather than removing it
      if (streamMessageId) {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === streamMessageId);
          if (idx === -1) return prev;
          const next = prev.slice();
          next[idx] = {
            ...prev[idx],
            content: (error?.message as string) || "Sorry, there was an error processing your request.",
          } as Message;
          return next;
        });
      }
      setMessages((prev) =>
        clampLastNMessages(
          [
            ...prev,
            {
              id: Date.now().toString(),
              role: "assistant",
              content: (error?.message as string) || "Sorry, there was an error processing your request.",
              chat_id: (chatId ?? id ?? "") as string,
              user_id: userData?.user?.id || "",
              created_at: new Date().toISOString(),
            },
          ],
          HISTORY_LIMIT
        )
      );
    } finally {
      setIsLoading(false);
      setSearchResults([]);
      setIsCodeRequest(false);
      setAttachedFile(null);
      setIsStreaming(false);
      const container = streamingContainerRef.current;
      if (container) container.textContent = "";
      streamingTextNodeRef.current = null;
      setStreamingAssistantId(null);
    }
  };
  return (
    <div className="flex min-h-full flex-col">
      {/* Scrollable content within main */}
      <div
        id="app-scroll"
        ref={contentRef}
        className="flex flex-1 flex-col px-2 py-4 sm:px-4 mx-auto w-full sm:max-w-[680px] md:max-w-[820px] lg:max-w-[980px]"
        style={{ paddingBottom: (inputHeight ?? 0) + 16 }}
      >
          <AnimatePresence initial={false}>
            {messages.length === 0 ? (
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
                {messages
                  .filter(Boolean)
                  .map((message) => (
                    <ChatMessage key={message.id} message={message} />
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

          {/* Search Results */}
          {searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ marginBottom: '1.5rem', marginTop: '1rem' }}
            >
              <SearchResults results={searchResults} />
            </motion.div>
          )}
      </div>

      {/* Footer input fixed to viewport bottom, offset by sidebar on desktop */}
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