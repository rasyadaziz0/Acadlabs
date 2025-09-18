import FileUpload from "@/components/FileUpload";

export default function UploadPage() {
  return (
    <main className="min-h-screen px-4 pb-8 pt-20">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold mb-2">Upload & Analisis</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Unggah gambar (Gemini Vision) atau dokumen (PDF/DOCX/TXT → GPT-oss). Untuk PDF hasil scan, sementara OCR PDF penuh belum diaktifkan.
        </p>
        <FileUpload />
      </div>
    </main>
  );
}
