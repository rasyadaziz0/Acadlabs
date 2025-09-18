"use client";

import { useEffect, useRef, useState } from "react";

export interface StreamCallbacks {
  onOpen?: () => void;
  onChunk?: (chunk: string) => void; // optional per-chunk observer (do NOT set React state here)
  onFlush?: (text: string) => void; // called every flush with accumulated text
  onClose?: () => void;
  onError?: (err: unknown) => void;
}

export interface StreamOptions extends StreamCallbacks {
  url?: string; // default "/api/math"
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: BodyInit | null;
  flushIntervalMs?: number; // default 150ms
  maxTotalChars?: number;   // default 120000
  autoAbortMs?: number;     // default 45000
  debug?: boolean;
}

const DEFAULT_FLUSH_INTERVAL_MS = 150;
const DEFAULT_MAX_TOTAL_CHARS = 120_000;
const DEFAULT_AUTO_ABORT_MS = 45_000;

export function useMathStreaming() {
  const [isStreaming, setIsStreaming] = useState(false);

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const flushIntervalIdRef = useRef<number | null>(null);
  const autoAbortTimeoutIdRef = useRef<number | null>(null);

  const bufferRef = useRef<string>("");
  const pendingRef = useRef<string>("");
  const decoderRef = useRef<TextDecoder | null>(null);
  const totalCharsRef = useRef<number>(0);
  const optsRef = useRef<Required<Pick<StreamOptions, "flushIntervalMs" | "maxTotalChars" | "autoAbortMs" | "debug">> & StreamCallbacks>({
    flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
    maxTotalChars: DEFAULT_MAX_TOTAL_CHARS,
    autoAbortMs: DEFAULT_AUTO_ABORT_MS,
    debug: false,
    onOpen: undefined,
    onChunk: undefined,
    onFlush: undefined,
    onClose: undefined,
    onError: undefined,
  });

  const log = (...args: unknown[]) => {
    if (optsRef.current.debug) console.log("[math-stream]", ...args);
  };

  const clearTimers = () => {
    if (flushIntervalIdRef.current != null) {
      clearInterval(flushIntervalIdRef.current);
      flushIntervalIdRef.current = null;
    }
    if (autoAbortTimeoutIdRef.current != null) {
      clearTimeout(autoAbortTimeoutIdRef.current);
      autoAbortTimeoutIdRef.current = null;
    }
  };

  const stop = () => {
    try { readerRef.current?.cancel(); } catch {}
    readerRef.current = null;
    try { abortRef.current?.abort(); } catch {}
    abortRef.current = null;
    clearTimers();
    setIsStreaming(false);
  };

  const flushBuffer = () => {
    const text = pendingRef.current;
    if (!text) return;
    pendingRef.current = "";
    try {
      optsRef.current.onFlush?.(text);
    } catch (e) {
      optsRef.current.onError?.(e);
    }
    log("onFlush len=", text.length, "totalChars=", totalCharsRef.current);
  };

  const debugSnapshot = () => ({
    isStreaming,
    totalChars: totalCharsRef.current,
    bufferLen: bufferRef.current.length,
    pending: pendingRef.current.length,
  });

  async function startStreaming(query: string, callbacks?: StreamCallbacks, config?: Partial<StreamOptions>) {
    // cleanup previous if any
    stop();
    setIsStreaming(true);

    // merge options
    optsRef.current.flushIntervalMs = config?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    optsRef.current.maxTotalChars = config?.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;
    optsRef.current.autoAbortMs = config?.autoAbortMs ?? DEFAULT_AUTO_ABORT_MS;
    optsRef.current.debug = !!config?.debug;
    optsRef.current.onOpen = callbacks?.onOpen;
    optsRef.current.onChunk = callbacks?.onChunk;
    optsRef.current.onFlush = callbacks?.onFlush;
    optsRef.current.onClose = callbacks?.onClose;
    optsRef.current.onError = callbacks?.onError;

    bufferRef.current = "";
    pendingRef.current = "";
    totalCharsRef.current = 0;
    decoderRef.current = new TextDecoder();

    const url = config?.url ?? "/api/math";
    const method = config?.method ?? "POST";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(config?.headers || {}),
    };
    const body: BodyInit | null = config?.body ?? JSON.stringify({
      messages: [
        { role: "user", content: query },
      ],
    });

    const ac = new AbortController();
    abortRef.current = ac;

    // auto-abort overall
    autoAbortTimeoutIdRef.current = window.setTimeout(() => {
      log("autoAbortMs reached; aborting stream");
      try { ac.abort(); } catch {}
    }, optsRef.current.autoAbortMs);

    // periodic flush
    flushIntervalIdRef.current = window.setInterval(() => {
      try { flushBuffer(); } catch (e) { optsRef.current.onError?.(e); }
    }, optsRef.current.flushIntervalMs);

    try {
      const res = await fetch(url, { method, headers, body, signal: ac.signal });
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "Failed to start stream");
        throw new Error(t || `HTTP ${res.status}`);
      }

      optsRef.current.onOpen?.();
      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = decoderRef.current!;
      let sawDone = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          bufferRef.current += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = bufferRef.current.indexOf("\n\n")) !== -1) {
            const rawEvent = bufferRef.current.slice(0, idx);
            bufferRef.current = bufferRef.current.slice(idx + 2);
            const lines = rawEvent.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data) continue;
              if (data === "[DONE]") { sawDone = true; break; }
              try {
                const obj = JSON.parse(data);
                const choice = obj?.choices?.[0];
                const token: string =
                  typeof choice?.delta?.content === "string"
                    ? choice.delta.content
                    : typeof choice?.text === "string"
                    ? choice.text
                    : "";
                if (token) {
                  optsRef.current.onChunk?.(token);
                  pendingRef.current += token;
                  totalCharsRef.current += token.length;
                  if (totalCharsRef.current >= optsRef.current.maxTotalChars) {
                    log("maxTotalChars reached; aborting stream");
                    try { ac.abort(); } catch {}
                    sawDone = true;
                    break;
                  }
                }
              } catch {
                // forward raw keep-alive or non-JSON data as-is
                if (data && data !== "[DONE]") {
                  pendingRef.current += data;
                  totalCharsRef.current += data.length;
                }
              }
            }
            if (sawDone) break;
          }
        }
        if (sawDone) break;
      }
    } catch (err) {
      optsRef.current.onError?.(err);
      throw err; // let caller know for UI toast if desired
    } finally {
      try { flushBuffer(); } catch {}
      try { readerRef.current?.cancel(); } catch {}
      readerRef.current = null;
      try { abortRef.current?.abort(); } catch {}
      abortRef.current = null;
      clearTimers();
      setIsStreaming(false);
      optsRef.current.onClose?.();
    }
  }

  useEffect(() => {
    return () => {
      stop();
    };
  }, []);

  return { isStreaming, startStreaming, stop, debugSnapshot } as const;
}

