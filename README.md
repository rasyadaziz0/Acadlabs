# Acadlabs

AI Chat Assistant berbahasa Indonesia untuk membantu berbagai tugas seperti merangkum teks, menyusun rencana, brainstorming, analisis data, dan menyelesaikan soal matematika.

## Fitur

### AI Chat
ChatGPT-like chat interface dengan dukungan:
- Streaming response real-time
- File upload (PDF, gambar, dokumen)
- Math rendering dengan KaTeX
- Code highlighting dengan Monaco Editor
- Chat history tersimpan di cloud
- Share chat via link

### Math Solver
Asisten matematika dengan fitur:
- Upload soal dari gambar/PDF
- Step-by-step penyelesaian dalam bahasa Indonesia
- LaTeX rendering untuk rumus matematika
- Mendukung berbagai topik: aljabar, kalkulus, statistika, dll.

### Code Editor
Editor kode interaktif dengan:
- Syntax highlighting
- Multiple language support
- Run code langsung di browser

### Market Analysis
Analisis pasar dan keuangan dengan data real-time.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** Radix UI, shadcn/ui
- **Auth & Database:** Supabase
- **AI:** Groq SDK, Google Gemini
- **Math Rendering:** KaTeX
- **Code Editor:** Monaco Editor
- **PWA:** Service Worker, Web App Manifest

## Getting Started

### Prerequisites

- Node.js 18+
- npm atau yarn

### Installation

1. Clone repository
```bash
git clone https://github.com/username/acadlabs.git
cd acadlabs
```

2. Install dependencies
```bash
npm install
```

3. Setup environment variables
```bash
cp .env.example .env.local
```

4. Run development server
```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

## Environment Variables

Buat file `.env.local` dengan variabel berikut:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Groq API
GROQ_API_KEY=your_groq_api_key
GROQ_API_KEY_1=your_groq_api_key_1 (optional fallback)
GROQ_API_KEY_2=your_groq_api_key_2 (optional fallback)

# Google Gemini (untuk image processing)
GOOGLE_API_KEY=your_google_api_key

# Site URL
NEXT_PUBLIC_SITE_URL=https://acadlabs.fun
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run analyze` | Analyze bundle size |

## Project Structure

```
src/
  app/
    (auth)/          # Auth pages (login, register)
    (dashboard)/     # Dashboard pages (chat, math, editor, market)
    api/             # API routes
    globals.css      # Global styles
    layout.tsx       # Root layout
  components/
    ui/              # Reusable UI components
    chat/            # Chat-related components
    auth/            # Auth components
    math-solver/     # Math solver components
  hooks/             # Custom React hooks
  lib/               # Utility functions & services
```

## License

MIT License - see [LICENSE](LICENSE) for details.