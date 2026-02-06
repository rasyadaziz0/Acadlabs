import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

interface UseAudioRecorderProps {
    onTranscriptionComplete: (text: string) => void;
}

export function useAudioRecorder({ onTranscriptionComplete }: UseAudioRecorderProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    useEffect(() => {
        // cleanup on unmount
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
        };
    }, []);

    const startRecording = async () => {
        // 1. Check for Secure Context (HTTPS or localhost)
        if (typeof window !== 'undefined' && !window.isSecureContext) {
            toast.error("Fitur mikrofon memerlukan HTTPS atau localhost. Koneksi anda tidak aman.");
            return;
        }

        // 2. Browser Support Check
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            toast.error("Browser ini tidak mendukung akses mikrofon.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // 3. Determine MIME Type
            let mimeType = "";
            if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
                mimeType = "audio/webm;codecs=opus"; // Chrome/Firefox/Edge
            } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
                mimeType = "audio/mp4"; // Safari iOS/MacOS
            } else {
                console.warn("No preferred mimeType found. Using default.");
            }

            const options = mimeType ? { mimeType } : undefined;
            const mediaRecorder = new MediaRecorder(stream, options);

            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                // Stop all tracks to release microphone
                stream.getTracks().forEach(track => track.stop());

                const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });

                if (blob.size < 500) {
                    toast.error("Suara tidak terdengar (terlalu pendek/hening).");
                    return;
                }

                // Determine extension for filename
                const ext = (mimeType && mimeType.includes('mp4')) ? 'm4a' : 'webm';
                const file = new File([blob], `input.${ext}`, { type: mimeType || 'audio/webm' });

                await handleTranscribe(file);
            };

            mediaRecorder.start();
            setIsRecording(true);
            toast.info("Mendengarkan...");

        } catch (err: any) {
            console.error("Mic Access Error:", err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                toast.error("Akses mikrofon ditolak. Mohon izinkan di pengaturan browser/sistem.", {
                    duration: 5000,
                });
            } else if (err.name === 'NotFoundError') {
                toast.error("Mikrofon tidak ditemukan.");
            } else {
                toast.error("Gagal memulai mikrofon: " + (err.message || "Unknown error"));
            }
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const handleTranscribe = async (file: File) => {
        setIsTranscribing(true);
        const toastId = toast.loading("Sedang mentranskrip...");

        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch("/api/speech-to-text", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                let errMsg = "Gagal menghubungi server.";
                try {
                    const errData = await response.json();
                    errMsg = errData.error || errMsg;
                } catch { /* empty */ }
                throw new Error(errMsg);
            }

            const data = await response.json();
            if (!data.text) {
                throw new Error("Transkripsi kosong.");
            }

            onTranscriptionComplete(data.text);
            toast.success("Selesai!", { id: toastId });

        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "Gagal transkripsi.", { id: toastId });
        } finally {
            setIsTranscribing(false);
        }
    };

    return {
        isRecording,
        isTranscribing,
        toggleRecording
    };
}
