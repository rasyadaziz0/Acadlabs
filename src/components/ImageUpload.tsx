"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AnalyzeResponse =
  | {
      ok: true;
      gemini: string;
      refined?: string;
      model: { gemini: string; gptoss?: string };
      meta: { mimeType: string; size: number };
    }
  | { ok: false; error: string; details?: any };

export default function ImageUpload({ className }: { className?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [refine, setRefine] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setResult(null);
    setError("");
    setFile(f ?? null);
  }, []);

  const onSubmit = useCallback(async () => {
    if (!file) {
      setError("Pilih file gambar terlebih dahulu.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("refine", String(refine));

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: fd,
      });

      const data: AnalyzeResponse = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(("error" in data ? data.error : "Gagal analisis") || "Gagal analisis");
      }
      setResult(data);
    } catch (err: any) {
      setError(err?.message || "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, [file, refine]);

  return (
    <div className={cn("w-full max-w-2xl mx-auto", className)}>
      <div className="flex items-center gap-2">
        <Input
          type="file"
          accept="image/*"
          onChange={onFileChange}
          className="border-0 ring-0 focus-visible:ring-0"
        />
        <label className="text-sm text-muted-foreground flex items-center gap-2 select-none">
          <input
            type="checkbox"
            className="accent-primary"
            checked={refine}
            onChange={(e) => setRefine(e.target.checked)}
          />
          Refinement GPT-oss
        </label>
        <Button
          onClick={onSubmit}
          disabled={loading || !file}
          variant="ghost"
          className="rounded-full ring-1 ring-black/10 dark:ring-white/10"
        >
          {loading ? "Menganalisis..." : "Analisis"}
        </Button>
      </div>

      {previewUrl && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="preview" className="max-h-64 rounded-lg object-contain" />
        </div>
      )}

      {error && (
        <div className="mt-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {result?.ok && (
        <div className="mt-4 space-y-3">
          <div>
            <div className="text-xs text-muted-foreground">Model: {result.model.gemini}{result.model.gptoss ? ` → ${result.model.gptoss}` : ""}</div>
            <div className="text-xs text-muted-foreground">File: {result.meta.mimeType}, {(result.meta.size / 1024).toFixed(1)} KB</div>
          </div>
          <div>
            <div className="text-sm font-medium mb-1">Hasil Gemini</div>
            <div className="whitespace-pre-wrap text-sm">{result.gemini}</div>
          </div>
          {result.refined && (
            <div>
              <div className="text-sm font-medium mb-1">Refinement GPT-oss</div>
              <div className="whitespace-pre-wrap text-sm">{result.refined}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
