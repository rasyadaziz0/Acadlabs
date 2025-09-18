import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ExternalLink } from "lucide-react";

type SearchResult = {
  title: string;
  url: string;
  description: string;
};

export default function SearchResults({ results }: { results: SearchResult[] }) {
  if (!results.length) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Search Results</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {results.slice(0, 3).map((result, index) => (
            <div key={index} className="space-y-1">
              <div className="flex items-center gap-1">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {result.title}
                </a>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">{result.description}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}