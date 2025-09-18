"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator } from "lucide-react";
import SolverForm from "./SolverForm";
import SolverOutput from "./SolverOutput";
import ErrorBoundary from "./ErrorBoundary";
import { useMathSolver } from "@/hooks/useMathSolver";
import { useMathUpload } from "./useMathUpload";

export default function MathSolver() {
  // Inputs
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>("");
  const [mode, setMode] = useState<"text" | "upload">("text");
  const [uploadFinal, setUploadFinal] = useState<string>("");

  // Non-streaming solver hook
  const { solveMath, solution, loading, clear } = useMathSolver();
  // Streaming upload hook (PDF/PNG/JPG → Gemini → GPT-oss)
  const { isStreaming: isUploadStreaming, solution: uploadSolution, uploadFile, stop } = useMathUpload();

  // File validation on change (UI only; processing disabled in non-stream mode)
  const onFileChange = (f: File | null) => {
    if (!f) {
      setFile(null); setError(""); return;
    }
    const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
    const allowedExt = new Set(["pdf", "png", "jpg", "jpeg"]);
    const allowedMime = new Set(["application/pdf", "image/png", "image/jpeg", "image/jpg"]);
    if (f.size > MAX_UPLOAD_BYTES) { setError("Ukuran file maksimal 10MB."); setFile(null); return; }
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!allowedExt.has(ext) || !allowedMime.has(f.type)) { setError("Hanya PDF/PNG/JPG yang didukung."); setFile(null); return; }
    setError(""); setFile(f);
  };

  // Submit handler (non-streaming only)
  const handleSubmit = async () => {
    if (loading || isUploadStreaming) return;
    if (file) {
      setError("");
      setMode("upload");
      clear();
      setUploadFinal("");
      console.info("[MathSolver] upload start", new Date().toISOString());
      try {
        const { uiText } = await uploadFile(file);
        setUploadFinal(uiText);
        console.info("[MathSolver] upload done", new Date().toISOString());
      } catch (e: any) {
        console.error("[MathSolver] upload error", e);
        setError(e?.message || "Gagal memproses file");
      }
      return;
    }
    const q = query.trim();
    if (!q) return;
    setError("");
    clear();
    console.info("[MathSolver] start", new Date().toISOString());
    try {
      setMode("text");
      await solveMath(q, { client_generated_id: "ms_" + Date.now() });
      // NOTE: Math Solver is ephemeral — do not persist to Supabase.
      console.info("[MathSolver] done", new Date().toISOString());
    } catch (e: any) {
      console.error("[MathSolver] error", e);
      setError(e?.message || "Gagal memproses permintaan");
    }
  };

  // Do NOT show streamed tokens for uploads; reveal only after finished.
  const finalSolution = mode === "upload" ? uploadFinal : solution;

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl shadow-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Math Solver
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SolverForm
            query={query}
            file={file}
            onQueryChange={setQuery}
            onFileChange={onFileChange}
            onSubmit={handleSubmit}
            loading={loading || isUploadStreaming}
            error={error}
          />
          <div className="mt-6">
            <ErrorBoundary
              fallback={
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <div className="text-sm text-muted-foreground">Terjadi kesalahan saat merender. Menampilkan teks biasa.</div>
                  <pre className="not-prose whitespace-pre-wrap break-words bg-transparent p-0 m-0 border-0 font-sans text-sm">{finalSolution}</pre>
                </div>
              }
            >
              <SolverOutput solution={finalSolution} />
            </ErrorBoundary>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
