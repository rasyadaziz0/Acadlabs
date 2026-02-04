"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUp, Search, Plus, X, Globe, Mic, Image as ImageIcon, FileText, AudioLines, StopCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
        textarea.style.overflowY = "hidden"
        return
      }

      // Temporarily set height to auto/minHeight to get correct scrollHeight
      textarea.style.height = `${minHeight}px`

      const scrollHeight = textarea.scrollHeight
      const isScrollable = scrollHeight > (maxHeight ?? Number.POSITIVE_INFINITY)

      const newHeight = Math.max(
        minHeight,
        Math.min(scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
      )

      textarea.style.height = `${newHeight}px`
      textarea.style.overflowY = isScrollable ? "auto" : "hidden"
    },
    [minHeight, maxHeight]
  )

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = `${minHeight}px`
      textarea.style.overflowY = "hidden"
    }
  }, [minHeight])

  useEffect(() => {
    const handleResize = () => adjustHeight()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [adjustHeight])

  return { textareaRef, adjustHeight }
}

const MIN_HEIGHT = 20
const MAX_HEIGHT = 200
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

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
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const isEmpty = value.trim().length === 0 && !selectedFile
  const canSend = allowFiles ? (value.trim().length > 0 || !!selectedFile) : value.trim().length > 0

  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (fileInputRef.current) {
      fileInputRef.current.value = "" // Reset file input
    }
    setSelectedFile(null)
    setImagePreview(null)
    onFileSelected?.(null)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null
    if (file && file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File size limit is 10MB")
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
      if (!isLoading && canSend) {
        onSubmit()
        adjustHeight(true)
      }
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

  const handleMicClick = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      await startRecording();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/m4a' });
        const file = new File([blob], 'recording.m4a', { type: 'audio/m4a' });
        await uploadAudio(file);
        stream.getTracks().forEach(track => track.stop()); // Stop mic stream
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.info("Listening...");
    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast.error("Could not access microphone.");
    }
  };

  const uploadAudio = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const toastId = toast.loading("Transcribing...");

    try {
      const res = await fetch("/api/speech-to-text", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.text) {
        // Append text logic
        const newText = value ? `${value} ${data.text}` : data.text;
        onChange(newText);
        // Force resize after content update
        // We need to wait a tick for the value to propagate to the DOM
        setTimeout(() => adjustHeight(), 0);
        toast.success("Transcribed!", { id: toastId });
      } else {
        toast.dismiss(toastId);
      }
    } catch (err) {
      toast.error("Failed to transcribe", { id: toastId });
    }
  };

  return (
    <div className={cn("w-full max-w-full overflow-hidden py-2 px-4", className)}>
      <motion.div
        layout
        className={cn(
          "relative flex items-end w-full p-2 rounded-[26px] border border-transparent transition-all shadow-sm",
          "bg-[#f4f4f4] dark:bg-[#303030]", // Updated dark mode bg to match ChatGPT
          "focus-within:bg-[#f4f4f4] dark:focus-within:bg-[#303030]"
        )}
      >
        {/* Left Actions: Plus Menu */}
        <div className="flex gap-2 items-center pb-2 pl-1 relative z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5",
                  (useSearch || selectedFile) && "text-zinc-800 dark:text-zinc-200"
                )}
                title="Add attachment or search"
              >
                <Plus className="h-5 w-5 stroke-[2.5]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 rounded-xl" sideOffset={8}>
              {allowFiles && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf,.docx,.txt"
                    onChange={handleChange}
                    className="hidden"
                  />
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="cursor-pointer py-2.5">
                    <ImageIcon className="mr-2 h-4 w-4" />
                    <span>Upload Image</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="cursor-pointer py-2.5">
                    <FileText className="mr-2 h-4 w-4" />
                    <span>Upload File</span>
                  </DropdownMenuItem>
                </>
              )}
              {onSearchToggle && (
                <DropdownMenuItem onClick={onSearchToggle} className="cursor-pointer py-2.5">
                  <Globe className="mr-2 h-4 w-4" />
                  <span>{useSearch ? "Disable Search" : "Search Web"}</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Textarea Container */}
        <div className="flex-1 min-w-0 relative flex flex-col pl-1">
          {/* File Previews (Inside Capsule) */}
          {allowFiles && (
            <div className="px-2 pt-2 empty:hidden">
              {imagePreview && (
                <div className="relative group inline-block mb-3">
                  <img src={imagePreview} alt="preview" className="h-16 w-16 object-cover rounded-xl border border-black/10 dark:border-white/10 shadow-sm" />
                  <button
                    onClick={handleClose}
                    className="absolute -top-1.5 -right-1.5 bg-zinc-800 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {selectedFile && !imagePreview && (
                <div className="relative inline-flex items-center gap-2 bg-white dark:bg-zinc-800 border border-black/5 dark:border-white/5 rounded-lg px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-3 shadow-sm">
                  <span className="truncate max-w-[150px]">{selectedFile.name}</span>
                  <button onClick={handleClose} className="text-zinc-400 hover:text-zinc-600">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="relative flex flex-col">
            {/* Search Mode Indicator */}
            <AnimatePresence>
              {useSearch && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: "auto", marginBottom: 4 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="flex items-center gap-1.5 overflow-hidden origin-top pl-1"
                >
                  <span className="flex items-center gap-1 text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full text-xs font-medium">
                    <Globe className="h-3 w-3" />
                    Mencari di web
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder={useSearch ? "Telusuri web..." : "Tanyakan apa saja..."}
                className="w-full min-h-[44px] !bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none resize-none py-3 px-1 text-[16px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 leading-relaxed custom-scrollbar"
                style={{ maxHeight: `${MAX_HEIGHT}px` }}
              />
            </div>
          </div>
        </div>

        {/* Right Actions: Mic & Send */}
        <div className="flex items-center gap-2 pb-2 pr-2">
          {/* Microphone Placeholder */}
          <button
            type="button"
            onClick={handleMicClick}
            className={cn(
              "p-2 rounded-full transition-all duration-200 hidden sm:flex items-center justify-center",
              isRecording
                ? "bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                : "text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700"
            )}
            title={isRecording ? "Stop Recording" : "Voice Input"}
          >
            {isRecording ? (
              <StopCircle className="h-5 w-5 animate-pulse" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => canSend ? onSubmit() : null}
            className={cn(
              "h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200",
              // ChatGPT Style: White circle with black icon when active/empty (Visual match)
              canSend || isLoading
                ? "bg-black text-white dark:bg-white dark:text-black shadow-md hover:opacity-90"
                : "bg-zinc-200 text-zinc-400 dark:bg-zinc-700 dark:text-zinc-500 cursor-not-allowed",
              isLoading && "opacity-70 cursor-not-allowed"
            )}
            disabled={isLoading || (!canSend && !isLoading)}
          >
            {isLoading ? (
              <div className="h-4 w-4 border-2 border-current border-solid border-t-transparent rounded-full animate-spin" />
            ) : (
              <ArrowUp className="h-5 w-5 stroke-[2.5]" />
            )}
          </button>
        </div>
      </motion.div>
    </div>
  )
}