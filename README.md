This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# Acadlabs

## Overview

Acadlabs adalah aplikasi Next.js dengan fitur chat dan Math Solver. Fokus utama:

- __Render matematika yang kuat__ dengan KaTeX (`remark-math` + `rehype-katex`).
- __Normalisasi delimiter__: input `\[...\]`, `\(...\)`, dan baris tunggal `[ ... ]` otomatis diubah ke `$` / `$$` agar KaTeX konsisten.
- __Code blocks ramah light/dark__: latar abu-abu medium di light mode dan gelap di dark mode.
- __Monaco Editor__ dengan tema custom `acadlabs-light`, dukungan bahasa alias (ts/js → typescript/javascript), dan JSX/TSX highlighting.
- __Math Solver tanpa pencarian__: solusi murni dari AI, tidak menggunakan konteks search.

## Menjalankan Secara Lokal

1. Install dependencies

```bash
npm install
```

2. Siapkan environment variables di file `.env` (lihat bagian Environment di bawah)

3. Jalankan dev server

```bash
npm run dev
```

Buka http://localhost:3000

## Environment

Wajib menyiapkan Groq API key untuk endpoint chat AI:

```bash
# .env
GROQ_API_KEY=your_groq_api_key
# Opsional, default: openai/gpt-oss-120b
GROQ_MODEL=openai/gpt-oss-120b
```

Jika Anda menggunakan Supabase untuk auth/profil, siapkan variabel terkait Supabase sesuai konfigurasi proyek Anda.

## Fitur Utama

- __Math rendering (KaTeX)__
  - Chat (`src/components/chat-message.tsx`) dan Math Solver (`src/components/math-solver.tsx`) merender LaTeX via KaTeX.
  - Normalisasi delimiter dilakukan agar format non-standar (`\[...\]`, `\(...\)`, dan baris `[ ... ]`) tetap dirender.
  - Di API (`src/app/api/chat/route.ts`) ditambahkan instruksi sistem agar model SELALU memakai `$...$` (inline) dan `$$...$$` (block, `$$` pada baris sendiri).

- __Monaco Editor & Code Blocks__
  - Komponen editor: `src/components/code-editor.tsx`.
  - Tema custom light: `acadlabs-light` (latar abu-abu lembut) dan `vs-dark` untuk dark mode.
  - Normalisasi alias bahasa: `ts`→`typescript`, `js`→`javascript`, dll.
  - Dukungan JSX/TSX dengan compiler options yang sesuai.
  - Di chat, code fence dengan label bahasa akan di-highlight Monaco.

- __Math Solver tanpa Search__
  - Komponen: `src/components/math-solver.tsx`.
  - Tombol “Cari Solusi” memanggil `/api/chat` langsung tanpa `searchResults`.
  - Output dinormalisasi delimiternya lalu dirender KaTeX.

## Cara Menulis Math & Code di Pesan

- __Math inline__: gunakan `$ ... $`
- __Math block__: gunakan `$$` pada baris terpisah, contoh:

```markdown
Gunakan rumus kuadrat:

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$
```

- __Code blocks__: beri label bahasa agar Monaco melakukan syntax highlighting, contoh:

```ts
function add(a: number, b: number) {
  return a + b;
}
```

## Berkas Penting

- `src/app/api/chat/route.ts` — Endpoint chat AI (Groq). Menambahkan instruksi sistem untuk konsistensi LaTeX.
- `src/components/chat-message.tsx` — Render pesan chat, normalisasi delimiter math, KaTeX, dan Monaco untuk code.
- `src/components/code-editor.tsx` — Monaco Editor dengan tema `acadlabs-light` dan dukungan alias bahasa + JSX/TSX.
- `src/components/math-solver.tsx` — Math Solver tanpa pencarian; panggil `/api/chat` langsung dan render solusi dengan KaTeX.

## Catatan Desain

- Light mode: latar code block/inline memakai abu-abu medium (mis. `bg-zinc-200` / `#e5e7eb`).
- Dark mode: latar gelap (`#1e1e1e`).
- Hindari menulis persamaan di dalam code fence; gunakan `$`/`$$` agar KaTeX merender.