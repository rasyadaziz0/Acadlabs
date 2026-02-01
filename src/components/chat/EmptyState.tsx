"use client";

import { motion } from "framer-motion";
import { Sparkles, Code, BookOpen, Lightbulb } from "lucide-react";

const suggestions = [
    { label: "Jelaskan Quantum Physics", icon: <BookOpen size={16} />, prompt: "Jelaskan fisika kuantum untuk pemula" },
    { label: "Debug kode React", icon: <Code size={16} />, prompt: "Bantu saya debug komponen React ini..." },
    { label: "Ide Judul Skripsi", icon: <Lightbulb size={16} />, prompt: "Berikan 5 ide judul skripsi tentang AI" },
];

export function EmptyState({ setInput }: { setInput: (val: string) => void }) {
    return (
        <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto px-4 text-center mt-0">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-4"
            >
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                    <Sparkles className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                    Hai, ada yang bisa AcadLabs bantu?
                </h2>
                <p className="text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                    Tanyakan apa saja, mulai dari kodingan, tugas kuliah, hingga analisis data.
                </p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 w-full">
                {suggestions.map((item, i) => (
                    <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + (i * 0.1) }}
                        onClick={() => setInput(item.prompt)}
                        className="flex flex-col items-start p-4 gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                    >
                        <div className="p-2 bg-zinc-100 dark:bg-zinc-900 rounded-lg text-zinc-600 dark:text-zinc-400">
                            {item.icon}
                        </div>
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            {item.label}
                        </span>
                    </motion.button>
                ))}
            </div>
        </div>
    );
}
