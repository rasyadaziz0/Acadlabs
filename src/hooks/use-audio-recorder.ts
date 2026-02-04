import { useState, useRef } from "react";
import { toast } from "sonner";

interface UseAudioRecorderProps {
    onTranscriptionComplete: (text: string) => void;
}

export function useAudioRecorder({ onTranscriptionComplete }: UseAudioRecorderProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            const chunks: Blob[] = [];

            mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const consumedStream = mediaRecorder.stream;

                const blob = new Blob(chunks, { type: 'audio/m4a' });
                const file = new File([blob], 'voice.m4a', { type: 'audio/m4a' });

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());

                // Handle Upload
                await handleTranscribe(file);
            };

            mediaRecorder.start();
            setIsRecording(true);
            toast.info("Mendengarkan...");
        } catch (error) {
            console.error("Mic Error:", error);
            toast.error("Gagal akses mikrofon");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const toggleRecording = () => {
        isRecording ? stopRecording() : startRecording();
    };

    const handleTranscribe = async (file: File) => {
        setIsTranscribing(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/speech-to-text", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if (data.text) {
                onTranscriptionComplete(data.text);
                toast.success("Transkripsi berhasil");
            }
        } catch (err) {
            toast.error("Gagal transkripsi");
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
