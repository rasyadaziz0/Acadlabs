import { ChatMessage } from "@/lib/ai-service";

// Approximate token counting and context trimming to avoid exceeding TPM/quotas
export function approxTokens(s: string): number {
    const str = typeof s === "string" ? s : String(s ?? "");
    return Math.ceil(str.length / 4); // rough heuristic
}

export function trimMessagesForBudget(
    messages: ChatMessage[],
    maxInputTokens: number
): ChatMessage[] {
    if (!Array.isArray(messages) || messages.length === 0) return [];
    const first = messages[0];
    const hasSystem = first && first.role === "system";
    const systemMsg = hasSystem ? first : null;
    const rest = hasSystem ? messages.slice(1) : messages.slice();

    let used = systemMsg ? approxTokens(String(systemMsg.content || "")) : 0;
    const picked: ChatMessage[] = [];

    for (let i = rest.length - 1; i >= 0; i--) {
        const m = rest[i];
        const c = String(m?.content ?? "");
        const t = approxTokens(c);
        if (used + t <= maxInputTokens || picked.length === 0) {
            // Always include at least the most recent message
            picked.push({ role: m.role, content: c });
            used += t;
        } else {
            break;
        }
    }
    picked.reverse();

    const result: ChatMessage[] = systemMsg
        ? [{ role: systemMsg.role, content: String(systemMsg.content || "") }, ...picked]
        : picked;

    // If we still exceed the budget, truncate the last (most recent) message tail
    const totalTokens = result.reduce((sum, m) => sum + approxTokens(String(m.content || "")), 0);
    if (totalTokens > maxInputTokens && result.length > 0) {
        const lastIdx = result.length - 1;
        const last = result[lastIdx];
        const over = totalTokens - maxInputTokens;
        const content = String(last.content || "");
        const keepChars = Math.max(0, content.length - over * 4);
        result[lastIdx] = { ...last, content: content.slice(-keepChars) };
    }

    return result;
}
