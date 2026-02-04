"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import ThemeLogo from "@/components/theme-logo";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import GlobeWireframe from "@/components/ui/globe-wireframe";
import { AnimatedButton } from "@/components/ui/animated-button";

export default function LandingPage() {
    return (
        <div className="relative flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/20 overflow-hidden">
            {/* Globe Background */}
            <div className="absolute inset-x-0 bottom-0 z-0 flex items-center justify-center pointer-events-none overflow-hidden">
                <div className="translate-y-[10%] md:translate-y-[35%] opacity-40">
                    <GlobeWireframe
                        className="w-[140vw] md:w-[1000px] aspect-square"
                        scale={1}
                        showGraticule={false}
                        autoRotate={true}
                        autoRotateSpeed={0.3}
                        variant="solid"
                    />
                </div>
            </div>

            {/* Decorative gradients */}
            <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-primary/5 blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-[100px]" />
            </div>

            <header className="relative z-10 container mx-auto flex h-20 items-center justify-between px-4 sm:px-8">
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
                        <Button size="sm" className="rounded-full px-4 text-xs sm:text-sm sm:px-6">
                            Sign up
                        </Button>
                    </Link>
                </div>
            </header>

            <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 text-center sm:px-8 pb-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="flex flex-col items-center max-w-3xl mx-auto space-y-8"
                >
                    <AnimatedButton
                        className="bg-green-500 text-white"
                        variant="default"
                        size="default"
                        glow={true}
                        textEffect="normal"
                        uppercase={true}
                        rounded="custom"
                        asChild={false}
                        hideAnimations={false}
                        shimmerColor="#ffe014ff"
                        shimmerSize="0.15em"
                        shimmerDuration="3s"
                        borderRadius="100px"
                        background="rgba(0, 0, 0, 1)"
                    >
                        Powering the next generation of learning
                    </AnimatedButton>
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
