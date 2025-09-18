"use client";

// Reference-only snippet to implement a safe, deduped Supabase Realtime listener.
// Not imported anywhere by default. Use this as a template if you need Realtime on math pages.

import { useEffect, useRef } from "react";
import { createSupabaseClient } from "@/lib/supabaseClient";

export type RTMessageRow = {
  id: string;
  chat_id?: string | null;
  user_id?: string | null; // owner of the chat/thread
  sender_id?: string | null; // who created this row (used to filter self)
  content?: string | null;
  created_at?: string | null;
};

/**
 * Subscribes to INSERT-only events on a table with dedupe and self-filtering.
 * - Filters out events created by the current user (sender_id === currentUserId)
 * - Dedupe by row.id using a Set
 * - Ensures only one subscription and removes the channel on cleanup
 */
export function useSafeRealtimeChannel(
  params: {
    channelName: string; // e.g., `realtime:messages:<chatId>`
    schema?: string; // default 'public'
    table: string; // e.g., 'messages'
    filter?: string; // e.g., `chat_id=eq.<id>`
    currentUserId: string | null | undefined;
    onInsert: (row: RTMessageRow) => void;
  }
) {
  const { channelName, schema = "public", table, filter, currentUserId, onInsert } = params;
  const supabase = createSupabaseClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUserId) return;
    // Ensure previous channel is removed before creating a new one
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
    }

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema, table, ...(filter ? { filter } : {}) },
        (payload) => {
          const row = payload.new as RTMessageRow;
          if (!row) return;
          // Filter out self
          if (row.sender_id && currentUserId && row.sender_id === currentUserId) return;
          // Dedupe by id
          if (row.id && seenRef.current.has(row.id)) return;
          if (row.id) seenRef.current.add(row.id);
          onInsert(row);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        try { supabase.removeChannel(channelRef.current); } catch {}
        channelRef.current = null;
      }
      // Periodically trim the seen set if needed (optional)
      if (seenRef.current.size > 10000) {
        seenRef.current = new Set(Array.from(seenRef.current).slice(-5000));
      }
    };
  }, [channelName, schema, table, filter, currentUserId, supabase, onInsert]);
}
