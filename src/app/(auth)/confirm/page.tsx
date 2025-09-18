import { Suspense } from "react";
import ConfirmPage from "./confirm-page";

export default function ConfirmEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-6 text-sm text-muted-foreground">
          Loading...
        </div>
      }
    >
      <ConfirmPage />
    </Suspense>
  );
}
