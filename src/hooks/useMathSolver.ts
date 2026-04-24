"use client";

import { useCallback, useRef, useState } from "react";

import { solveMathAction } from "@/app/actions/ai";

export type SolveOpts = {
  conversationId?: string;
  client_generated_id?: string;
};

export type UseMathSolver = {
  solution: string;
  loading: boolean;
  error: string;
  solveMath: (query: string, opts?: SolveOpts) => Promise<void>;
  clear: () => void;
};

// Avoid duplicating large strings in memory: keep only a single solution string.
export function useMathSolver(): UseMathSolver {
  const [solution, setSolution] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const inFlightRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    setSolution("");
    setError("");
  }, []);

  const solveMath = useCallback(async (query: string, opts?: SolveOpts) => {
    const q = String(query ?? "").trim();
    if (!q) return;

    // Cancel any previous request to keep only one in memory
    try { inFlightRef.current?.abort(); } catch {}
    const ac = new AbortController();
    inFlightRef.current = ac;

    setLoading(true);
    setError("");
    setSolution("");

    try {
      // Use Server Action instead of fetch API route
      // The prompt is now handled on the server side in solveMathAction
      const result = await solveMathAction(q);

      if (!result.success) {
        throw new Error(result.error || "Gagal memproses");
      }

      setSolution(result.data!);
    } catch (e: any) {
      if (e?.name === "AbortError") return; // Silent on abort
      setError(e?.message || "Gagal memproses");
      throw e;
    } finally {
      setLoading(false);
      try { inFlightRef.current?.abort(); } catch {}
      inFlightRef.current = null;
    }
  }, []);

  return { solveMath, solution, loading, error, clear };
}
