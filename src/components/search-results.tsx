import { ExternalLink, Search } from "lucide-react";

type SearchResult = {
  title: string;
  url: string;
  description: string;
};

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanText(input: string): string {
  return decodeHtml(stripTags(input || "")).replace(/\s+/g, " ").trim();
}

function getDomain(raw: string): string {
  try {
    const h = new URL(raw).hostname;
    return h.startsWith("www.") ? h.slice(4) : h;
  } catch {
    return raw;
  }
}

export default function SearchResults({ results }: { results: SearchResult[] }) {
  if (!results.length) return null;

  return (
    <div className="w-full max-w-[72ch] min-w-0">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Search className="h-3.5 w-3.5" />
        <span>Search results</span>
      </div>
      <div className="divide-y divide-border/40">
        {results.slice(0, 3).map((result, index) => {
          const title = cleanText(result.title) || result.url;
          const desc = cleanText(result.description);
          const domain = getDomain(result.url);
          return (
            <a
              key={index}
              href={result.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="group block p-3 first:pt-0 last:pb-0 rounded-md transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="truncate text-[15px] font-medium text-foreground group-hover:underline"
                    title={title}
                  >
                    {title}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground/80" />
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{domain}</div>
                {desc && (
                  <p
                    className="mt-1 text-sm text-muted-foreground"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {desc}
                  </p>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}