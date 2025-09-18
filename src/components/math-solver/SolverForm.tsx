"use client";

import { ChangeEvent, useEffect, useMemo, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Image as ImageIcon, X, Send } from "lucide-react";

type Props = {
  query: string;
  file: File | null;
  onQueryChange: (v: string) => void;
  onFileChange: (file: File | null) => void;
  onSubmit: () => void;
  loading: boolean;
  error?: string;
};

export default function SolverForm(props: Props) {
  const {
    query,
    file,
    onQueryChange,
    onFileChange,
    onSubmit,
    loading,
    error,
  } = props;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrl = useMemo(
    () => (file && file.type?.startsWith("image/") ? URL.createObjectURL(file) : ""),
    [file]
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    onFileChange(f);
    // reset input so same file can be re-picked
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = () => onFileChange(null);

  return (
    <div className="space-y-3">
      <Textarea
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Masukan soal atau Upload File"
        className="min-h-[150px] max-h-[40vh] overflow-y-auto resize-none rounded-xl"
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/jpg"
        onChange={handleFileChange}
        className="sr-only hidden"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-col gap-2">
          {file && (
            <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm shadow-sm">
              {file.type === "application/pdf" ? (
                <FileText className="h-4 w-4" />
              ) : (
                <ImageIcon className="h-4 w-4" />
              )}
              <span className="truncate max-w-[220px]" title={file.name}>
                {file.name}
              </span>
              <button
                type="button"
                onClick={removeFile}
                className="ml-1 inline-flex items-center justify-center rounded-full hover:bg-foreground/10"
                aria-label="Hapus file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {!file && (
            <div className="text-xs text-muted-foreground">
              Format: PDF atau PNG/JPG. Maksimal 10MB.
            </div>
          )}
          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2 rounded-full bg-muted text-foreground/80 hover:bg-muted/80 border-0 shadow-sm"
          >
            <Upload className="h-4 w-4" />
            Upload
          </Button>
          <Button
            onClick={onSubmit}
            disabled={loading || (!query.trim() && !file)}
            className="bg-yellow-400 text-black hover:bg-yellow-500 rounded-full shadow-sm"
          >
            {loading ? "Memproses..." : "Menjawab"}
            {!loading && <Send className="ml-1 h-4 w-4" />}
          </Button>
        </div>
      </div>

      {previewUrl && (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="preview" className="max-h-64 rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
