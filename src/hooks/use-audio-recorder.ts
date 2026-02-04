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

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach((track) => track.stop());
                const audioBlob = new Blob(chunks, { type: "audio/m4a" });
                const audioFile = new File([audioBlob], "voice.m4a", { type: "audio/m4a" });
                await handleTranscribe(audioFile);
            };

            mediaRecorder.start();
            setIsRecording(true);
            toast.info("Mendengarkan...");
        } catch (err) {
            console.error("Mic Error:", err);
            toast.error("Gagal akses mikrofon. Pastikan izin diberikan.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
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
        const toastId = toast.loading("Mentranskrip suara...");
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/speech-to-text", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) throw new Error("Gagal request ke API");

            const data = await res.json();
            if (data.text) {
                onTranscriptionComplete(data.text);
                toast.success("Selesai!", { id: toastId });
            } else {
                throw new Error("Tidak ada text yang dikembalikan");
            }
        } catch (error) {
            console.error(error);
            toast.error("Gagal mengubah suara ke teks", { id: toastId });
        } finally {
            setIsTranscribing(false);
        }
    };

    return { isRecording, isTranscribing, toggleRecording };
}
