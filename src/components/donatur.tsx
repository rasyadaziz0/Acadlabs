import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function Donatur() {
    return (
      <section className="min-h-dvh w-full bg-neutral-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Back button row */}
          <div className="lg:col-span-3">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-full bg-neutral-800/60 text-white px-4 py-2 hover:bg-neutral-700/70 border border-white/10 shadow-sm transition-colors"
              aria-label="Kembali ke halaman Chat"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali ke Chat</span>
            </Link>
          </div>
          {/* Left: Leaderboard with heading */}
          <div className="lg:col-span-2 flex flex-col gap-3">
            <div className="text-base font-semibold text-white">Top 10 Investor terbaik</div>
            <div
              className="relative w-full overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10"
              style={{ aspectRatio: "16 / 9" }}
            >
              <iframe
                src="https://tako.id/overlay/leaderboard?overlay_key=j8dr5ebxshs1z36zam3namyg"
                title="Acadlabs Leaderboard"
                className="absolute inset-0 h-full w-full"
                loading="lazy"
              />
            </div>
          </div>

          {/* Right: QR + CTA */}
          <div className="lg:col-span-1 flex flex-col items-center gap-4 lg:sticky lg:top-8">
            {/* QR Code: fixed size to show full overlay card (no cropping) */}
            <div
              className="relative overflow-hidden rounded-xl shadow-xl ring-1 ring-white/10 bg-black/40 w-[379px] h-[345px] sm:w-[420px] sm:h-[382px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://quickchart.io/qr?text=https%3A%2F%2Ftako.id%2FAcadlabs&size=256&centerImageUrl=https%3A%2F%2Fassets.tako.id%2Fbadges%2Fqr.png"
                alt="Acadlabs QR Code"
                className="absolute inset-0 h-full w-full object-contain"
                loading="lazy"
              />
            </div>

            <div className="text-sm text-neutral-200">Ayo jadi investor sekarang</div>
            <a
              href="https://tako.id/Acadlabs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-yellow-400 text-black font-semibold px-6 py-3 shadow-lg ring-1 ring-yellow-300/40 transition-colors hover:bg-yellow-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yellow-400/40"
            >
              investor
            </a>
          </div>
        </div>
      </section>
    );
  }