"use client";

import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RealtimeListenerParams<T> = {
  chatId?: string;
  currentUserId: string;
  onMessageBatch: (items: T[]) => void;
  channelName?: string; // optional custom channel name
  flushMs?: number; // default 150ms
  ttlMs?: number; // default 60_000ms
};

/**
 * Safe Realtime listener for Supabase messages table.
 * - Subscribes once using provided Supabase client
 * - Filters out events produced by current user to avoid echo loops
 * - Dedupe by id using TTL map
 * - Buffers events and flushes in batches every flushMs (default 150ms)
 * - Cleans up on unmount
 */
export function useRealtimeMessagesListener<T extends { id: string; chat_id?: string; user_id?: string; sender_id?: string }>(
  supabase: SupabaseClient,
  params: RealtimeListenerParams<T>
) {
  const { chatId, currentUserId, onMessageBatch, channelName, flushMs = 150, ttlMs = 60_000 } = params;

  const bufRef = useRef<T[]>([]);
  const dedupeRef = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    // Start periodic flusher
    const flush = () => {
      const batch = bufRef.current;
      if (batch.length > 0) {
        bufRef.current = [];
        try {
          onMessageBatch(batch);
        } catch (e) {
          // swallow
        }
      }
      // TTL cleanup
      const now = Date.now();
      const map = dedupeRef.current;
      for (const [k, ts] of map.entries()) {
        if (now - ts > ttlMs) map.delete(k);
      }
    };
    intervalRef.current = window.setInterval(flush, flushMs);

    // Setup channel
    const name = channelName || `realtime:messages${chatId ? ":" + chatId : ""}`;
    const channel = supabase
      .channel(name)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: chatId ? `chat_id=eq.${chatId}` : undefined },
        (payload) => {
          const row = payload?.new as T | null;
          if (!row) return;
          const sender = (row as any).sender_id ?? (row as any).user_id;
          if (sender && String(sender) === String(currentUserId)) return; // ignore own events

          const id = (row as any).id as string | undefined;
          if (!id) return;
          const map = dedupeRef.current;
          if (map.has(id)) return;
          map.set(id, Date.now());

          bufRef.current.push(row);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      try {
        if (intervalRef.current != null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } catch {}
      try {
        if (channelRef.current) supabase.removeChannel(channelRef.current);
      } catch {}
      channelRef.current = null;
      bufRef.current = [];
      dedupeRef.current.clear();
    };
  }, [supabase, chatId, currentUserId, onMessageBatch, channelName, flushMs, ttlMs]);
}
