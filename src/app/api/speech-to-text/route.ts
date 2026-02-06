import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getGroqKeys } from "@/lib/ai-service";

// Helper to convert Web File to format Groq SDK accepts in Node environment if needed
// But normally Groq SDK v0.7.0+ accepts Web File objects directly.
// We will simply pass it through but log proactively.

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
            console.error("[API] No file found in FormData");
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        console.log(`[API] Received file: ${file.name}, size: ${file.size}, type: ${file.type}`);

        const keys = getGroqKeys();
        if (!keys || keys.length === 0) {
            console.error("[API] No Groq API Keys configured");
            return NextResponse.json({ error: "Server misconfiguration: No API Key" }, { status: 500 });
        }

        const apiKey = keys[Math.floor(Math.random() * keys.length)];
        const groq = new Groq({ apiKey });

        // Ensure we are passing the file correctly.
        // In some Next.js ver, passing the File directly works.
        // Explicitly defining model as requested by user.
        const transcription = await groq.audio.transcriptions.create({
            file: file,
            model: "whisper-large-v3-turbo",
            temperature: 0,
            response_format: "verbose_json", // or 'json' or 'text'
        });

        console.log(`[API] Transcription success: ${transcription.text?.substring(0, 20)}...`);

        return NextResponse.json({ text: transcription.text });
    } catch (error: any) {
        console.error("[API] Transcription error:", error);
        // Return the specific error message from Groq if available
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
