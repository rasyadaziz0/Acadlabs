"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Send, Search, Paperclip, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"

interface UseAutoResizeTextareaProps {
  minHeight: number
  maxHeight?: number
}

function useAutoResizeTextarea({
  minHeight,
  maxHeight,
}: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current
      if (!textarea) return

      if (reset) {
        textarea.style.height = `${minHeight}px`
        return
      }

      textarea.style.height = `${minHeight}px`
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
      )

      textarea.style.height = `${newHeight}px`
    },
    [minHeight, maxHeight]
  )

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = `${minHeight}px`
    }
  }, [minHeight])

  useEffect(() => {
    const handleResize = () => adjustHeight()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [adjustHeight])

  return { textareaRef, adjustHeight }
}

const MIN_HEIGHT = 44
const MAX_HEIGHT = 164
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

const AnimatedPlaceholder = ({ showSearch }: { showSearch: boolean }) => (
  <AnimatePresence mode="wait">
    <motion.p
      key={showSearch ? "search" : "ask"}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.1 }}
      className={`pointer-events-none w-[150px] text-sm absolute ${showSearch
        ? "bg-gradient-to-r from-blue-600 via-purple-600 via-cyan-400 to-blue-600 bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer"
        : "text-black/70 dark:text-white/70"
        }`}
    >
      {showSearch ? "Search the web..." : "Ask Acadlabs AI..."}
    </motion.p>
  </AnimatePresence>
)

interface AiInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (overrideText?: string) => void
  placeholder?: string
  showSearch?: boolean
  onSearchToggle?: () => void
  isLoading?: boolean
  useSearch?: boolean
  className?: string
  onFileSelected?: (file: File | null) => void
  attachedFile?: File | null
  allowFiles?: boolean
  variant?: "default" | "borderless"
}

export default function AiInput({
  value,
  onChange,
  onSubmit,
  showSearch = false,
  onSearchToggle,
  isLoading = false,
  useSearch = false,
  className,
  onFileSelected,
  attachedFile,
  allowFiles = true,
  variant = "default",
}: AiInputProps) {
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
  })
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(attachedFile ?? null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isBorderless = variant === "borderless"

  // Ensure text-only mode clears any previously selected file
  useEffect(() => {
    if (!allowFiles) {
      if (fileInputRef.current) fileInputRef.current.value = ""
      setSelectedFile(null)
      if (imagePreview) URL.revokeObjectURL(imagePreview)
      setImagePreview(null)
      onFileSelected?.(null)
    }
  }, [allowFiles])

  const canSend = allowFiles ? (value.trim().length > 0 || !!selectedFile) : value.trim().length > 0
  const compactTextOnly = isBorderless && !allowFiles && !onSearchToggle

  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (fileInputRef.current) {
      fileInputRef.current.value = "" // Reset file input
    }
    setSelectedFile(null)
    setImagePreview(null) // Use null instead of empty string
    onFileSelected?.(null)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null
    if (file && file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("Ukuran file maksimal 10MB")
      if (fileInputRef.current) fileInputRef.current.value = ""
      setSelectedFile(null)
      setImagePreview(null)
      onFileSelected?.(null)
      return
    }
    setSelectedFile(file)
    if (file && file.type?.startsWith("image/")) {
      setImagePreview(URL.createObjectURL(file))
    } else {
      setImagePreview(null)
    }
    onFileSelected?.(file)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    adjustHeight()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
      adjustHeight(true)
    }
  }

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview)
      }
    }
  }, [imagePreview])

  // Sync from parent when attachedFile changes (controlled mode)
  useEffect(() => {
    if (attachedFile === undefined) return
    setSelectedFile(attachedFile)
    // Revoke old preview when switching
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    if (attachedFile && attachedFile.type?.startsWith("image/")) {
      const url = URL.createObjectURL(attachedFile)
      setImagePreview(url)
    } else {
      setImagePreview(null)
    }
  }, [attachedFile])

  return (
    <div className={cn("w-full max-w-full overflow-hidden py-2", className)}>
      <div
        className={cn(
          "relative w-full max-w-full overflow-hidden mx-auto",
          useSearch && "rounded-[22px] p-[1px] bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-400"
        )}
      >
        <div
          className={cn(
            "relative flex flex-col overflow-hidden",
            isBorderless
              ? "bg-black/5 dark:bg-white/5 ring-1 ring-black/10 dark:ring-white/10"
              : "bg-gray-100 dark:bg-[#1f1f1f]",
            useSearch ? "rounded-[25px]" : "rounded-3xl"
          )}
        >
          <div
            className="overflow-y-auto"
            style={{ maxHeight: `${MAX_HEIGHT}px` }}
          >
            <div className="relative">
              <Textarea
                value={value}
                placeholder=""
                className={cn(
                  "w-full min-w-0 px-4 py-2.5 text-black dark:text-white border-none resize-none focus-visible:ring-0 leading-[1.2]",
                  isBorderless ? "bg-transparent" : "bg-gray-100 dark:bg-[#1f1f1f]",
                  compactTextOnly && "pr-10"
                )}
                ref={textareaRef}
                onKeyDown={handleKeyDown}
                onChange={handleInputChange}
                disabled={isLoading}
              />
              {!value && (
                <div className="absolute left-4 top-3">
                  <AnimatedPlaceholder showSearch={showSearch} />
                </div>
              )}
              {compactTextOnly && (
                <button
                  type="button"
                  onClick={() => onSubmit()}
                  disabled={isLoading || !canSend}
                  className={cn(
                    "absolute right-2 bottom-2 rounded-full p-2 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5",
                    (isLoading || !canSend) && "opacity-50 cursor-not-allowed"
                  )}
                  aria-label="Send message"
                  title="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {allowFiles && imagePreview && (
            <div className="px-3 pb-2 flex justify-start">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="attachment preview" className="h-16 w-16 object-cover rounded-lg" />
                <button
                  type="button"
                  onClick={handleClose}
                  className="absolute -right-2 -top-2 rounded-full p-1 bg-black/60 text-white hover:bg-black/70"
                  title="Remove attachment"
                  aria-label="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {allowFiles && selectedFile && !imagePreview && (
            <div className="px-3 pb-2 flex justify-start">
              <div className="flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2 text-sm">
                <span className="truncate max-w-[220px]">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-full p-1 hover:bg-black/10 dark:hover:bg-white/10"
                  title="Remove attachment"
                  aria-label="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {!compactTextOnly && (
            <div
              className={cn(
                "h-12 flex items-center justify-between px-3",
                isBorderless ? "bg-black/5 dark:bg-white/5" : "bg-gray-100 dark:bg-[#1f1f1f]"
              )}
            >
              <div className="flex items-center gap-2">
                {allowFiles && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.pdf,.docx,.txt"
                      onChange={handleChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "cursor-pointer rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/5",
                        !isBorderless && "ring-1 ring-black/10 dark:ring-white/10"
                      )}
                      title="Attach file"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                  </>
                )}
                {onSearchToggle && (
                  <button
                    type="button"
                    onClick={onSearchToggle}
                    className={cn(
                      "cursor-pointer rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/5",
                      useSearch ? "bg-black/10 dark:bg-white/10" : "bg-transparent",
                      !isBorderless && "ring-1 ring-black/10 dark:ring-white/10"
                    )}
                    title="Toggle search mode"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => onSubmit()}
                disabled={isLoading || !canSend}
                className={cn(
                  "cursor-pointer rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/5",
                  !isBorderless && "ring-1 ring-black/10 dark:ring-white/10",
                  isLoading || !canSend
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                )}
                title="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}