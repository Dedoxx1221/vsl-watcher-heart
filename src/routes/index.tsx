import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vexora — Analytics de VSL" },
      { name: "description", content: "Painel de retenção e conversão para VSLs." },
      { property: "og:title", content: "Vexora — Analytics de VSL" },
      { property: "og:description", content: "Painel de retenção e conversão para VSLs." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
