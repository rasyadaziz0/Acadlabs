import { type AttachmentMeta } from "@/components/chat/AttachmentPreview";
import { sanitizeUserText } from "@/lib/sanitize";

export const parseAttachmentMarker = (text: string): { meta?: AttachmentMeta; body: string } => {
    if (!text) return { body: "" };
    const re = /^::attachment\[([^\]]+)\]\s*\n?/;
    const m = text.match(re);
    if (!m) return { body: text };
    const kv = m[1].split(/\s*,\s*/).map((p) => p.split("=").map((s) => s.trim())) as [string, string][];
    const meta: AttachmentMeta = { name: "" } as any;
    for (const [k, v] of kv) {
        const val = v?.replace(/^"|"$/g, "");
        if (k === "name") meta.name = val;
        else if (k === "type") meta.type = val;
        else if (k === "size") meta.size = Number(val);
    }
    if (meta.name && !meta.ext) {
        const i = meta.name.lastIndexOf(".");
        if (i >= 0) meta.ext = meta.name.slice(i + 1).toUpperCase();
    }
    const body = text.replace(re, "");
    return { meta, body };
};

export const composeAttachmentMarker = (meta?: AttachmentMeta) => {
    if (!meta || !meta.name) return "";
    const rawName = meta.name || "file";
    const rawType = meta.type || "application/octet-stream";
    const safeName = sanitizeUserText(rawName).replace(/"/g, '\\"').replace(/\n|\r/g, " ").slice(0, 200);
    const safeType = sanitizeUserText(rawType).replace(/"/g, '\\"').replace(/\n|\r/g, " ").slice(0, 100);
    const size = Number(meta.size || 0);
    return `::attachment[name="${safeName}",type="${safeType}",size=${size}]`;
};
