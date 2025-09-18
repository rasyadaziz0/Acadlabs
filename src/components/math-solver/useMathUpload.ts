"use client";

import { useRef, useState } from "react";
import { UI_MAX_CHARS, decodeHtmlEntities } from "./math-utils";

const DEBUG = typeof window !== "undefined" && (() => { try { return window.localStorage?.getItem("MATH_DEBUG") === "1"; } catch { return false; } })();
const dlog = (...args: any[]) => { if (DEBUG) console.debug("[math-upload]", ...args); };

export function useMathUpload() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [solution, setSolution] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const stop = () => {
    dlog("stop()");
    try { abortRef.current?.abort(); } catch {}
    abortRef.current = null;
    setIsStreaming(false);
  };

  async function uploadFile(file: File): Promise<{ uiText: string; fullText: string; didTruncate: boolean }> {
    stop();
    setSolution("");
    setIsStreaming(true);
    dlog("uploadFile", { name: file?.name, type: file?.type, size: file?.size });

    const ac = new AbortController();
    abortRef.current = ac;

    const uiParts: string[] = [];
    let uiTotal = 0;
    let uiTruncated = false;
    const fullParts: string[] = [];

    let buffer = "";
    let pendingChunk = "";
    let flushTimer: any = null;
    let done = false;
    let idleTimer: any = null;
    let eventCount = 0;

    const SSE_BUFFER_CAP = 200_000;
    const SSE_BUFFER_TAIL = 50_000;
    const IDLE_TIMEOUT_MS = 90_000;

    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        dlog("idle timeout reached, aborting upload stream");
        try { ac.abort(); } catch {}
      }, IDLE_TIMEOUT_MS);
    };

    const flushNow = () => {
      if (!pendingChunk) return;
      fullParts.push(pendingChunk);
      if (!uiTruncated) {
        const remaining = UI_MAX_CHARS - uiTotal;
        if (remaining > 0) {
          const uiAdd = pendingChunk.slice(0, remaining);
          uiParts.push(uiAdd);
          uiTotal += uiAdd.length;
          setSolution((prev) => (prev + uiAdd).slice(0, UI_MAX_CHARS));
          if (pendingChunk.length > remaining) {
            uiParts.push("\n\n… [output too long; truncated in UI]");
            setSolution((prev) => (prev + "\n\n… [output too long; truncated in UI]").slice(0, UI_MAX_CHARS));
            uiTruncated = true;
          }
        } else {
          uiTruncated = true;
        }
      }
      pendingChunk = "";
    };

    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        try { flushNow(); } finally { flushTimer = null; }
      }, 100);
    };

    try {
      const fd = new FormData();
      fd.append("file", file);
      const response = await fetch("/api/math-upload", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        signal: ac.signal,
        body: fd,
      });
      dlog("/api/math-upload response", { ok: response.ok, status: response.status });
      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => "Failed to get solution");
        dlog("response not ok or body missing", { status: response.status, text });
        throw new Error(text || "Failed to get solution");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      resetIdle();

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const normalized = chunk.indexOf("\r") !== -1 ? chunk.replace(/\r\n/g, "\n") : chunk;
          buffer += normalized;
          if (buffer.length > SSE_BUFFER_CAP) buffer = buffer.slice(-SSE_BUFFER_TAIL);
          resetIdle();
        }
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLines = rawEvent.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
          for (const data of dataLines) {
            if (!data) continue;
            if (data === "[DONE]") { done = true; break; }
            try {
              const json = JSON.parse(data);
              const delta = json?.choices?.[0]?.delta;
              const token: string = typeof delta?.content === "string" ? delta.content : (json?.choices?.[0]?.text as string) || "";
              if (token) {
                pendingChunk += decodeHtmlEntities(token);
                eventCount++;
                if (DEBUG && eventCount % 100 === 0) dlog("received events:", eventCount);
                scheduleFlush();
                resetIdle();
              }
            } catch {}
          }
        }
      }

      try { flushNow(); } catch {}
      if (flushTimer) { try { clearTimeout(flushTimer); } catch {}; flushTimer = null; }

      const uiText = uiParts.join("").slice(0, UI_MAX_CHARS);
      const fullText = fullParts.join("");
      dlog("upload stream done", { uiLen: uiText.length, fullLen: fullText.length, uiTruncated });
      setSolution(uiText);
      return { uiText, fullText, didTruncate: uiTruncated };
    } finally {
      setIsStreaming(false);
      try { if (flushTimer) clearTimeout(flushTimer); } catch {}
      try { if (idleTimer) clearTimeout(idleTimer); } catch {}
      try { abortRef.current?.abort(); } catch {}
      abortRef.current = null;
    }
  }

  return { isStreaming, solution, uploadFile, stop } as const;
}

