import { createSupabaseClient } from "@/lib/supabaseClient";
import imageCompression from "browser-image-compression";

const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export interface UploadResult {
    url: string;
    type: string;
    name: string;
}

export async function uploadChatAttachment(file: File): Promise<UploadResult> {
    // 1. Validasi Ukuran Awal (Sebelum Kompresi)
    if (file.size > MAX_SIZE_BYTES) {
        throw new Error(`File terlalu besar! Maksimal ${MAX_SIZE_MB}MB.`);
    }

    const supabase = createSupabaseClient();
    let fileToUpload = file;

    // 2. Smart Compression (Khusus Gambar)
    if (file.type.startsWith("image/")) {
        try {
            console.log(`Original Image: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

            const options = {
                maxSizeMB: 1,           // Target hasil kompresi: 1MB
                maxWidthOrHeight: 1920, // Resize dimensi kalau kegedean (4K -> HD)
                useWebWorker: true,
                initialQuality: 0.8
            };

            const compressedFile = await imageCompression(file, options);

            // Cek hasil kompresi (Jaga-jaga kalau malah jadi gede atau gagal)
            if (compressedFile.size < file.size) {
                fileToUpload = compressedFile;
                console.log(`Compressed Image: ${(fileToUpload.size / 1024 / 1024).toFixed(2)} MB`);
            }
        } catch (error) {
            console.warn("Gagal kompres gambar, upload file asli...", error);
        }
    }

    // 3. Generate Nama Unik (Clean Filename)
    const fileExt = file.name.split(".").pop();
    // Sanitize filename to avoid weird characters
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueName = `public/${Date.now()}-${sanitizedName}`;

    // 4. Upload ke Supabase
    const { data, error } = await supabase.storage
        .from("chat-attachments")
        .upload(uniqueName, fileToUpload, {
            cacheControl: "3600",
            upsert: false
        });

    if (error) {
        console.error("Upload error:", error);
        throw new Error(`Upload gagal: ${error.message}`);
    }

    // 5. Ambil Public URL
    const { data: { publicUrl } } = supabase.storage
        .from("chat-attachments")
        .getPublicUrl(uniqueName);

    return {
        url: publicUrl,
        type: file.type, // Keep original type
        name: file.name  // Keep original name
    };
}
