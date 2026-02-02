import ImageUpload from "@/components/ImageUpload";

export default function AnalyzePage() {
  return (
    <div className="min-h-screen px-4 pb-8 pt-20">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold mb-2">Image Analysis</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Unggah gambar untuk dianalisis dengan Gemini 2.5 Flash. Opsional: refinement dengan GPT-oss.
        </p>
        <ImageUpload />
      </div>
    </div>
  );
}
