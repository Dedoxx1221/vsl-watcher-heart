import { createFileRoute } from "@tanstack/react-router";
import { handleDiagnosis } from "@/lib/ai/diagnosis.server";

export const Route = createFileRoute("/api/diagnosis")({
  server: { handlers: { POST: ({ request }) => handleDiagnosis(request) } },
});
