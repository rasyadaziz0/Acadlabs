"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { handleFileUpload as handleUploadClient } from "@/lib/upload-client";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export default function FileUpload({ className }: { className?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [refine, setRefine] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<{ source: string; content: string; meta?: any } | null>(null);

  const isImage = useMemo(() => !!file?.type?.startsWith("image/"), [file]);
  const previewUrl = useMemo(() => (isImage && file ? URL.createObjectURL(file) : ""), [isImage, file]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setResult(null);
    // Validate 10MB limit
    if (f && f.size > MAX_FILE_SIZE_BYTES) {
      setError("Ukuran file maksimal 10MB");
      e.target.value = ""; // reset input
      setFile(null);
      return;
    }
    setError("");
    setFile(f);
  }, []);

  const onSubmit = useCallback(async () => {
    if (!file) {
      setError("Pilih file terlebih dahulu.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("Ukuran file maksimal 10MB");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await handleUploadClient(file, { refineImage: refine });
      setResult(r);
    } catch (err: any) {
      setError(err?.message || "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, [file, refine]);

  return (
    <div className={cn("w-full max-w-2xl mx-auto", className)}>
      <div className="flex flex-col gap-2">
        <Input
          type="file"
          accept="image/*,.pdf,.docx,.txt"
          onChange={onFileChange}
          className="border-0 ring-0 focus-visible:ring-0"
        />
        {isImage && (
          <label className="text-sm text-muted-foreground flex items-center gap-2 select-none">
            <input
              type="checkbox"
              className="accent-primary"
              checked={refine}
              onChange={(e) => setRefine(e.target.checked)}
            />
            Refinement GPT-oss (khusus gambar)
          </label>
        )}
        <div>
          <Button
            onClick={onSubmit}
            disabled={loading || !file}
            variant="ghost"
            className="rounded-full ring-1 ring-black/10 dark:ring-white/10"
          >
            {loading ? "Memproses..." : "Proses"}
          </Button>
        </div>
      </div>

      {previewUrl && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="preview" className="max-h-64 rounded-lg object-contain" />
        </div>
      )}

      {error && <div className="mt-3 text-sm text-red-500">{error}</div>}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-muted-foreground">Sumber: {result.source}</div>
          <div className="whitespace-pre-wrap text-sm">{result.content}</div>
        </div>
      )}
    </div>
  );
}
