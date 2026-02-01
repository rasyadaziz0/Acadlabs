"use client";

import { useState, useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { toast } from "sonner";
import { sanitizeUserText } from "@/lib/sanitize";

export function useMessageActions() {
    const [saving, setSaving] = useState(false);

    const supabase = useMemo(
        () =>
            createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            ),
        []
    );

    const updateMessageContent = async (messageId: string, userId: string, content: string) => {
        try {
            setSaving(true);
            const { data: userData } = await supabase.auth.getUser();
            if (!userData?.user || userData.user.id !== userId) {
                throw new Error("Tidak bisa mengedit pesan ini");
            }

            const { data: updated, error } = await supabase
                .from("messages")
                .update({ content })
                .eq("id", messageId)
                .eq("user_id", userData.user.id)
                .select("*")
                .single();

            if (error) throw error;
            return updated;
        } catch (error: any) {
            const msg = error?.message || "Gagal menyimpan perubahan";
            toast.error(msg);
            throw error;
        } finally {
            setSaving(false);
        }
    };

    return { updateMessageContent, saving };
}
