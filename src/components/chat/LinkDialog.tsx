"use client";

import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface LinkDialogProps {
  url: string | null;
  onOpenChange: (open: boolean) => void;
}

export default function LinkDialog({ url, onOpenChange }: LinkDialogProps) {
  return (
    <Dialog open={!!url} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eh, mau pergi begitu aja? 😢</DialogTitle>
          <DialogDescription>
            Yaelah brok masa pergi begitu aja?... tapi kalau nekat, semoga link baru itu nggak bikin bingung ya{" "}
            <a
              href="https://support.google.com/webmasters/answer/3258249?hl=en"
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              Learn more
            </a>
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm break-words whitespace-pre-wrap text-foreground dark:text-gray-100">{url}</div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (!url) return;
              navigator.clipboard?.writeText(url).catch(() => {});
            }}
          >
            Copy link
          </Button>
          <Button
            onClick={() => {
              if (!url) return;
              const u = url;
              onOpenChange(false);
              try {
                window.open(u, "_blank", "noopener,noreferrer");
              } catch {
                window.location.href = u;
              }
            }}
          >
            Open link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
