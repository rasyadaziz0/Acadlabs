"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ChatMessage from "@/components/chat-message";
import type { Message as ChatMessageType } from "@/components/chat-message";
import AiInput from "@/components/ui/ai-input";
import { sanitizeUserText } from "@/lib/sanitize";

// Dynamically import Monaco-based CodeEditor to code-split heavy editor bundle
const CodeEditor = dynamic(() => import("@/components/code-editor"), {
  ssr: false,
});

const defaultCode = {
  javascript: `// JavaScript Example
console.log("Hello, World!");

// You can define functions too
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
console.log("Factorial of 5 is:", factorial(5));
`,
  python: `# Python Example
print("Hello, World!")

# You can define functions too
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

print(f"Factorial of 5 is: {factorial(5)}")
`,
  cpp: `// C++ Example
#include <iostream>
using namespace std;

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    cout << "Hello, World!" << endl;
    cout << "Factorial of 5 is: " << factorial(5) << endl;
    return 0;
}
`,
  java: `// Java Example
public class Main {
    public static int factorial(int n) {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
    }
    
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        System.out.println("Factorial of 5 is: " + factorial(5));
    }
}
`,
  go: `// Go Example
package main

import "fmt"

func factorial(n int) int {
    if n <= 1 {
        return 1
    }
    return n * factorial(n - 1)
}

func main() {
    fmt.Println("Hello, World!")
    fmt.Println("Factorial of 5 is:", factorial(5))
}
`,
  php: `<?php
// PHP Example
echo "Hello, World!\n";

function factorial($n) {
    if ($n <= 1) return 1;
    return $n * factorial($n - 1);
}

echo "Factorial of 5 is: " . factorial(5) . "\n";
?>
`
} as const;

type Language = keyof typeof defaultCode;

// Mapping bahasa ke language_id Judge0
const languageMap: { id: number; name: string; value: Language }[] = [
  { id: 63, name: "JavaScript (Node.js 12.14.0)", value: "javascript" },
  { id: 71, name: "Python (3.8.1)", value: "python" },
  { id: 54, name: "C++ (GCC 9.2.0)", value: "cpp" },
  { id: 62, name: "Java (OpenJDK 13.0.1)", value: "java" },
  { id: 60, name: "Go (1.13.5)", value: "go" },
  { id: 68, name: "PHP (7.4.1)", value: "php" }
];

export default function EditorPage() {
  const [language, setLanguage] = useState<Language>("javascript");
  const [code, setCode] = useState<string>(defaultCode.javascript);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");

  // Local chat state (no persistence). Visible only on lg screens via JSX.
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const chatContentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Update code when language changes
  useEffect(() => {
    setCode(defaultCode[language]);
  }, [language]);

  // Auto-scroll management: only when near bottom; disable smooth during streaming
  useEffect(() => {
    const el = chatContentRef.current;
    if (!el) return;
    const onScroll = () => {
      const threshold = 100; // px
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      setShouldAutoScroll(atBottom);
    };
    el.addEventListener("scroll", onScroll);
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!shouldAutoScroll) return;
    messagesEndRef.current?.scrollIntoView({ behavior: isChatLoading ? "auto" : "smooth", block: "end" });
  }, [messages, isChatLoading, shouldAutoScroll]);

  const handleRunCode = async () => {
    setIsRunning(true);
    setOutput("");
    setError("");

    try {
      // For JavaScript, we can run it locally for quick feedback
      if (language === "javascript") {
        try {
          // Create a safe evaluation environment
          const consoleOutput: string[] = [];
          const mockConsole = {
            log: (...args: any[]) => {
              consoleOutput.push(args.map(arg => String(arg)).join(' '));
            },
            error: (...args: any[]) => {
              consoleOutput.push(`Error: ${args.map(arg => String(arg)).join(' ')}`);
            },
            warn: (...args: any[]) => {
              consoleOutput.push(`Warning: ${args.map(arg => String(arg)).join(' ')}`);
            },
          };

          // Execute the code in a safe context
          const executeCode = new Function('console', code);
          executeCode(mockConsole);
          
          setOutput(consoleOutput.join('\n'));
        } catch (error) {
          setError(`Execution error: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        // For other languages, use Judge0 API
        // Find the language_id for the selected language
        const selectedLanguage = languageMap.find(lang => lang.value === language);
        if (!selectedLanguage) {
          throw new Error("Unsupported language selected");
        }

        const response = await fetch("/api/run-code", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            source_code: code,
            language_id: selectedLanguage.id,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to execute code");
        }

        // Handle the response
        if (data.status && data.status.description === "Accepted") {
          setOutput(data.stdout || "(No output)");
          if (data.stderr) {
            setError(data.stderr);
          }
        } else if (data.status) {
          setError(`Execution error: ${data.status.description}\n${data.stderr || ""}`);
        } else {
          setError("Unknown error occurred");
        }
      }
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleLanguageChange = (value: string) => {
    setLanguage(value as Language);
  };

  const handleCodeChange = (value?: string) => {
    if (value !== undefined) setCode(value);
  };

  const handleChatSubmit = async () => {
    if (!input.trim()) return;

    const cleanInput = sanitizeUserText(input);
    const userMsg: ChatMessageType = {
      id: Date.now().toString(),
      role: "user",
      content: cleanInput,
      chat_id: "local",
      user_id: "local",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsChatLoading(true);

    const tempAssistantId = `temp-${Date.now()}`;
    setStreamingAssistantId(tempAssistantId);
    const tempAssistant: ChatMessageType = {
      id: tempAssistantId,
      role: "assistant",
      content: "",
      chat_id: "local",
      user_id: "local",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempAssistant]);

    try {
      // Build messages for API: include prior chat, current code context, and new user message
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const codeContext = {
        role: "system",
        content: [
          `You are assisting with code currently open in the editor.`,
          `Language: ${language}`,
          `Here is the full code (use as context for your answer):`,
          "",
          "```" + language,
          code,
          "```",
        ].join("\n"),
      } as const;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          messages: [...history, codeContext, { role: "user", content: cleanInput }],
        }),
      });

      if (!response.ok || !response.body) {
        const msg = await response.text().catch(() => "Failed to get AI response");
        throw new Error(msg || "Failed to get AI response");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      let pendingChunk = "";
      let displayed = "";
      let rafPending = false;
      let lastFlushTs = 0;
      const FLUSH_MIN_INTERVAL_MS = 33;
      const MIN_CHARS_BEFORE_FORCED_FLUSH = 64;

      const scheduleFlush = () => {
        if (rafPending) return;
        rafPending = true;
        const tick = () => {
          const now = performance.now();
          const shouldFlush =
            now - lastFlushTs >= FLUSH_MIN_INTERVAL_MS || pendingChunk.length >= MIN_CHARS_BEFORE_FORCED_FLUSH;
          if (!shouldFlush) {
            requestAnimationFrame(tick);
            return;
          }
          if (pendingChunk) {
            displayed += pendingChunk;
            pendingChunk = "";
            setMessages((prev) => prev.map((m) => (m.id === tempAssistantId ? { ...m, content: displayed } : m)));
            lastFlushTs = now;
          }
          rafPending = false;
        };
        requestAnimationFrame(tick);
      };

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const dataLines = rawEvent
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim());

          for (const data of dataLines) {
            if (!data) continue;
            if (data === "[DONE]") {
              done = true;
              break;
            }
            try {
              const json = JSON.parse(data);
              const delta = json?.choices?.[0]?.delta;
              const token: string = typeof delta?.content === "string" ? delta.content : (json?.choices?.[0]?.text as string) || "";
              if (token) {
                pendingChunk += token;
                scheduleFlush();
              }
            } catch (e) {
              // ignore parse errors on keepalive/comments
            }
          }
        }
      }

      // Final flush
      if (pendingChunk) {
        displayed += pendingChunk;
        pendingChunk = "";
        setMessages((prev) => prev.map((m) => (m.id === tempAssistantId ? { ...m, content: displayed } : m)));
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: e?.message || "Sorry, there was an error processing your request.",
          chat_id: "local",
          user_id: "local",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsChatLoading(false);
      setStreamingAssistantId(null);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Code editor and output */}
          <Card className="lg:col-span-7">
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle>Reason Code</CardTitle>
                <div className="w-full md:w-64">
                  <Select value={language} onValueChange={handleLanguageChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Language" />
                    </SelectTrigger>
                    <SelectContent>
                      {languageMap.map((lang) => (
                        <SelectItem key={lang.id} value={lang.value}>
                          {lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <CodeEditor
                  code={code}
                  onChange={handleCodeChange}
                  language={language}
                />

                <div className="flex justify-end">
                  <Button onClick={handleRunCode} disabled={isRunning} className="px-6">
                    {isRunning ? "Running..." : "Run Code"}
                  </Button>
                </div>

                {(output || error) && (
                  <Card className="mt-4 border-gray-700">
                    <CardHeader>
                      <CardTitle className="text-sm">Output</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {output && (
                        <pre className="bg-muted p-4 rounded-md overflow-auto max-h-[200px] text-sm whitespace-pre-wrap">{output}</pre>
                      )}
                      {error && (
                        <pre className="bg-red-950/20 text-red-400 p-4 mt-2 rounded-md overflow-auto max-h-[200px] text-sm whitespace-pre-wrap">{error}</pre>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right: Chat panel (desktop only) */}
          <div className="hidden lg:flex lg:col-span-5">
            <div className="flex flex-col w-full h-[75vh] rounded-2xl">
              {/* Messages */}
              <div ref={chatContentRef} id="reason-chat-scroll" className="flex-1 overflow-y-auto px-2 space-y-3">
                {messages.length === 0 ? (
                  <div className="h-full w-full flex items-center justify-center text-center text-muted-foreground text-sm px-6">
                    Ask about the current code, request refactors, or explanations. The assistant will use your editor code as context.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((m, i) => (
                      <ChatMessage key={`${m.id}-${i}`} message={m} showCaret={isChatLoading && m.id === streamingAssistantId} isStreaming={isChatLoading && m.id === streamingAssistantId} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="pt-2">
                <AiInput
                  value={input}
                  onChange={setInput}
                  onSubmit={() => handleChatSubmit()}
                  isLoading={isChatLoading}
                  allowFiles={false}
                  variant="borderless"
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}