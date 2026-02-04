"use client";

import { useEffect, useRef } from "react";
import { createSupabaseClient } from "@/lib/supabaseClient";

export type RTMessageRow = {
  id: string;
  chat_id?: string | null;
  user_id?: string | null;
  sender_id?: string | null;
  content?: string | null;
  created_at?: string | null;
};

export function useSafeRealtimeChannel(
  params: {
    channelName: string;
    schema?: string;
    table: string;
    filter?: string;
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
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch { }
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
          if (row.sender_id && currentUserId && row.sender_id === currentUserId) return;
          if (row.id && seenRef.current.has(row.id)) return;
          if (row.id) seenRef.current.add(row.id);
          onInsert(row);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        try { supabase.removeChannel(channelRef.current); } catch { }
        channelRef.current = null;
      }
      if (seenRef.current.size > 10000) {
        seenRef.current = new Set(Array.from(seenRef.current).slice(-5000));
      }
    };
  }, [channelName, schema, table, filter, currentUserId, supabase, onInsert]);
}
