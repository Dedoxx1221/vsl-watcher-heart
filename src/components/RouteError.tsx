import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

const STALE_CHUNK = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const stale = STALE_CHUNK.test(error instanceof Error ? error.message : String(error));
  useEffect(() => {
    if (stale) {
      // Old saved copy of a page after an update: reload once to get the fresh version.
      const key = "chunk-reload-at";
      const last = Number(sessionStorage.getItem(key) ?? 0);
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
        return;
      }
    }
    console.error(error);
    reportLovableError(error, { boundary: "tanstack_route_error_component" });
  }, [error, stale]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Esta página não carregou</h1>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { if (stale) window.location.reload(); else { router.invalidate(); reset(); } }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}
