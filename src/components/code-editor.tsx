"use client";

import React, { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { motion } from "framer-motion";
import { Clipboard } from "lucide-react";
import { useTheme } from "next-themes";

interface MonacoEditorProps {
  code?: string;
  language?: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
  height?: string | number;
  expandable?: boolean;
  maxHeight?: number;
  minHeight?: number;
}

const MonacoEditor: React.FC<MonacoEditorProps> = ({
  code = " ", // default 1 spasi utk menjaga tinggi minimal
  language = "javascript",
  onChange,
  readOnly = false,
  height,
  maxHeight = 600,
  minHeight = 60,
}) => {
  const { resolvedTheme } = useTheme();

  // Dynamic height state for auto-fit based on content size
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [autoHeight, setAutoHeight] = useState<number>(() => {
    const lines = (code || "").split(/\r\n|\r|\n/).length || 1;
    const lineHeight = 18; // keep in sync with options.lineHeight
    const estimated = lines * lineHeight + 16; // + vertical padding
    return Math.min(maxHeight, Math.max(minHeight, estimated));
  });

  // Track last applied text to the model to compute append diff
  const lastTextRef = useRef<string>(code ?? " ");
  const pendingTextRef = useRef<string | null>(null);
  const rafUpdatingRef = useRef<number | null>(null);
  const heightRafRef = useRef<number | null>(null);

  // Map umum agar bahasa dari markdown (ts, tsx, js, jsx, sh, dll) dikenali Monaco
  const normalizeLanguage = (lang?: string) => {
    const l = (lang || "").toLowerCase();
    const map: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      typescript: "typescript",
      js: "javascript",
      jsx: "javascript",
      javascript: "javascript",
      sh: "shell",
      bash: "shell",
      zsh: "shell",
      ps1: "powershell",
      yml: "yaml",
      md: "markdown",
      csharp: "csharp",
      cs: "csharp",
      cpp: "cpp",
      c: "c",
      h: "c",
      py: "python",
      rs: "rust",
      rb: "ruby",
      kt: "kotlin",
      docker: "dockerfile",
    };
    return map[l] || l || "plaintext";
  };

  const computedLanguage = normalizeLanguage(language);
  const handleCopy = () => {
    try {
      const modelText = editorRef.current?.getModel?.()?.getValue?.();
      navigator.clipboard.writeText(typeof modelText === "string" ? modelText : (code ?? ""));
    } catch {
      navigator.clipboard.writeText(code ?? "");
    }
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Initialize content imperatively without controlled value
    try {
      const model = editor.getModel?.();
      if (model) {
        model.setValue(code ?? " ");
        lastTextRef.current = code ?? " ";
      }
    } catch {}

    // Throttled height updater (avoid excessive React state churn)
    const updateHeight = () => {
      if (heightRafRef.current != null) return;
      heightRafRef.current = requestAnimationFrame(() => {
        heightRafRef.current = null;
        let contentHeight = 0;
        try {
          contentHeight = typeof editor.getContentHeight === "function"
            ? editor.getContentHeight()
            : editor.getTopForLineNumber((editor.getModel()?.getLineCount?.() || 1) + 1) + 16;
        } catch {
          contentHeight = autoHeight;
        }
        const h = Math.min(maxHeight, Math.max(minHeight, contentHeight));
        setAutoHeight((prev) => (Math.abs(prev - h) > 1 ? h : prev));
        editor.layout();
      });
    };
    editor.onDidContentSizeChange(updateHeight);
    updateHeight();

    // Bubble user edits when not readOnly
    if (!readOnly && typeof onChange === "function") {
      editor.onDidChangeModelContent(() => {
        const val = editor.getValue?.();
        onChange(val);
      });
    }
  };

  // Imperatively apply code updates using rAF batching
  useEffect(() => {
    pendingTextRef.current = code ?? "";
    if (rafUpdatingRef.current != null) return;
    rafUpdatingRef.current = requestAnimationFrame(() => {
      rafUpdatingRef.current = null;
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const desired = pendingTextRef.current ?? "";
      pendingTextRef.current = null;
      if (!editor || !monaco) return;
      const model = editor.getModel?.();
      if (!model) return;

      const last = lastTextRef.current ?? "";
      try {
        const currentVal = model.getValue?.() ?? "";
        if (desired === currentVal) {
          lastTextRef.current = desired;
          return;
        }
      } catch {}

      if (desired === last) return;
      
      if (desired.startsWith(last)) {
        const delta = desired.slice(last.length);
        const lastLine = model.getLineCount();
        const lastCol = model.getLineMaxColumn(lastLine);
        const range = new monaco.Range(lastLine, lastCol, lastLine, lastCol);
        editor.executeEdits("append", [
          { range, text: delta, forceMoveMarkers: true },
        ]);
      } else {
        // Fallback: set full value
        model.setValue(desired);
      }
      lastTextRef.current = desired;

      // Ensure layout is up to date after content changes
      try { editor.layout(); } catch {}
    });
  }, [code]);

  // Cleanup any pending rAF when unmounting
  useEffect(() => {
    return () => {
      if (rafUpdatingRef.current != null) {
        cancelAnimationFrame(rafUpdatingRef.current);
        rafUpdatingRef.current = null;
      }
      if (heightRafRef.current != null) {
        cancelAnimationFrame(heightRafRef.current);
        heightRafRef.current = null;
      }
    };
  }, []);

  const hVal = height ?? autoHeight;
  const minimapEnabled = typeof hVal === "number" ? hVal >= 120 : false;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg overflow-hidden border shadow-lg bg-gray-200 border-gray-300 dark:bg-[#1e1e1e] dark:border-gray-700"
    >
      {/* Header minimal */}
      <div className="px-3 py-2 flex items-center justify-between border-b bg-gray-200 border-gray-300 text-gray-700 dark:bg-[#2d2d2d] dark:border-gray-700 dark:text-gray-300">
        <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{language}</div>
        <motion.button
          onClick={handleCopy}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        >
          <Clipboard size={14} />
        </motion.button>
      </div>

      {/* Monaco Editor */}
      <Editor
        height={height ?? autoHeight}
        language={computedLanguage}
        defaultValue={code}
        onMount={handleEditorMount}
        beforeMount={(monaco) => {
          // Define a light theme with a subtle gray background so it isn't too bright
          monaco.editor.defineTheme('acadlabs-light', {
            base: 'vs',
            inherit: true,
            rules: [],
            colors: {
              'editor.background': '#e5e7eb', // tailwind gray-200
              'editorGutter.background': '#e5e7eb',
              'minimap.background': '#e5e7eb',
              'editorLineNumber.foreground': '#9ca3af', // gray-400
              'editorLineNumber.activeForeground': '#6b7280', // gray-500
              'editor.selectionBackground': '#c7d2fe66', // indigo-200 @ 40%
              'editor.inactiveSelectionBackground': '#e5e7eb66', // gray-200 @ 40%
              'editorWidget.background': '#f9fafb', // gray-50
            },
          });

          // Aktifkan dukungan JSX/TSX agar token berwarna pada React/TS
          monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            jsx: (monaco.languages.typescript as any).JsxEmit?.ReactJSX ?? (monaco.languages.typescript as any).JsxEmit?.React,
            allowNonTsExtensions: true,
          });
          monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
            jsx: (monaco.languages.typescript as any).JsxEmit?.ReactJSX ?? (monaco.languages.typescript as any).JsxEmit?.React,
            allowNonTsExtensions: true,
          });
        }}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'acadlabs-light'}
        options={{
          readOnly,
          minimap: { enabled: minimapEnabled },
          fontSize: 14,
          lineNumbers: "on",
          roundedSelection: false,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: "on",
          folding: true,
          lineDecorationsWidth: 10,
          lineNumbersMinChars: 3,
          glyphMargin: false,
          lineHeight: 18, // <-- bikin jarak antar baris lebih rapat
          padding: { top: 8, bottom: 8 },
          maxTokenizationLineLength: 10000, // Meningkatkan batas tokenisasi untuk teks panjang
        }}
      />
    </motion.div>
  );
};

export default MonacoEditor;
