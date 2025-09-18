import { useCallback, useMemo, useRef, useState } from 'react'

export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
}

export type UseLimitedChatOptions = {
  limit?: number // max messages to retain in history
}

function clampLastN<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr
  return arr.slice(arr.length - n)
}

let _idSeq = 0
function uid() {
  _idSeq += 1
  return `${Date.now()}-${_idSeq}`
}

export function useLimitedChat(options: UseLimitedChatOptions = {}) {
  const { limit = 50 } = options

  const [messages, setMessages] = useState<ChatMessage[]>([])

  // Streaming state is isolated from history so history list doesn't re-render on each chunk
  const [streamingText, setStreamingText] = useState<string>('')
  const [isStreaming, setIsStreaming] = useState(false)

  // Internal buffer + rAF scheduling to throttle React updates during streaming
  const bufRef = useRef<string>('')
  const rafRef = useRef<number | null>(null)

  const flushOnRaf = useCallback(() => {
    rafRef.current = null
    if (bufRef.current.length === 0) return
    const chunk = bufRef.current
    bufRef.current = ''
    setStreamingText((prev) => prev + chunk)
  }, [])

  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(flushOnRaf)
  }, [flushOnRaf])

  const appendUser = useCallback((text: string) => {
    setMessages((prev) => clampLastN([...prev, { id: uid(), role: 'user', content: text }], limit))
  }, [limit])

  const beginStream = useCallback(() => {
    // Reset streaming state
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    bufRef.current = ''
    setStreamingText('')
    setIsStreaming(true)
  }, [])

  const appendChunk = useCallback((text: string) => {
    if (!isStreaming) return
    bufRef.current += text
    scheduleFlush()
  }, [isStreaming, scheduleFlush])

  const commitStream = useCallback((finalOverride?: string) => {
    if (!isStreaming) return
    // Ensure any buffered text is flushed
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const finalText = (finalOverride !== undefined ? finalOverride : (streamingText + bufRef.current))
    bufRef.current = ''
    setStreamingText('')
    setIsStreaming(false)
    if (finalText.length > 0) {
      setMessages((prev) => clampLastN([...prev, { id: uid(), role: 'assistant', content: finalText }], limit))
    }
  }, [isStreaming, streamingText, limit])

  const cancelStream = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    bufRef.current = ''
    setStreamingText('')
    setIsStreaming(false)
  }, [])

  const reset = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    bufRef.current = ''
    setStreamingText('')
    setIsStreaming(false)
    setMessages([])
  }, [])

  const api = useMemo(() => ({
    messages,
    isStreaming,
    streamingText,
    appendUser,
    beginStream,
    appendChunk,
    commitStream,
    cancelStream,
    reset,
  }), [messages, isStreaming, streamingText, appendUser, beginStream, appendChunk, commitStream, cancelStream, reset])

  return api
}
