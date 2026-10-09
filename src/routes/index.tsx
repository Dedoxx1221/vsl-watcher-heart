import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Retina — Analytics de VSL" },
      { name: "description", content: "Painel de retenção e conversão para VSLs." },
      { property: "og:title", content: "Retina — Analytics de VSL" },
      { property: "og:description", content: "Painel de retenção e conversão para VSLs." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
