"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import ThemeLogo from "@/components/theme-logo";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

export default function LandingPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/20">
            {/* Decorative gradients */}
            <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-primary/5 blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-[100px]" />
            </div>

            <header className="container mx-auto flex h-20 items-center justify-between px-4 sm:px-8">
                <div className="flex items-center gap-2">
                    <ThemeLogo className="h-8 w-auto" alt="AcadLabs Logo" />
                    <span className="text-xl font-bold tracking-tight">AcadLabs</span>
                </div>
                <div className="flex items-center gap-4">
                    <Link href="/login">
                        <Button variant="ghost" className="text-sm font-medium">
                            Log in
                        </Button>
                    </Link>
                    <Link href="/register">
                        <Button size="sm" className="hidden sm:inline-flex rounded-full px-6">
                            Sign up
                        </Button>
                    </Link>
                </div>
            </header>

            <main className="flex flex-1 flex-col items-center justify-center px-4 text-center sm:px-8 pb-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="flex flex-col items-center max-w-3xl mx-auto space-y-8"
                >
                    <div className="inline-flex items-center rounded-full border bg-secondary/50 px-3 py-1 text-sm text-secondary-foreground backdrop-blur-sm">
                        <Sparkles className="mr-2 h-3.5 w-3.5 text-yellow-500" />
                        <span className="text-xs font-medium">Powering the next generation of learning</span>
                    </div>

                    <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
                        Master your <br />
                        <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                            studies
                        </span>{" "}
                        with AI
                    </h1>

                    <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
                        AcadLabs is your intelligent study companion. Solve complex problems,
                        visualize concepts, and accelerate your learning journey with advanced AI tools.
                    </p>

                    <div className="flex flex-col w-full gap-4 sm:flex-row sm:justify-center sm:w-auto pt-4">
                        <Link href="/login">
                            <Button size="lg" className="w-full sm:w-auto h-12 px-8 rounded-full text-base shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95">
                                Get Started
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                        <Link href="#features">

                        </Link>
                    </div>
                </motion.div>
            </main>

            <footer className="py-6 text-center text-sm text-muted-foreground/60">
                <p>© {new Date().getFullYear()} AcadLabs. All rights reserved.</p>
            </footer>
        </div>
    );
}
