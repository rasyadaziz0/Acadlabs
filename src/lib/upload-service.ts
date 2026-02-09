
import { createSupabaseClient } from "@/lib/supabaseClient";

export async function uploadChatAttachment(file: File): Promise<string> {
    const supabase = createSupabaseClient();
    const bucket = "chat-attachments";

    // Create unique file path: public/timestamp-filename
    // Sanitize filename to avoid weird characters
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = `public/${Date.now()}-${sanitizedName}`;

    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false
        });

    if (error) {
        console.error("Upload error:", error);
        throw new Error(`Failed to upload file: ${error.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

    return publicUrl;
}
