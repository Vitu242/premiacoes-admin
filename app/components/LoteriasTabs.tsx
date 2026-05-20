"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const tabs = [
  { id: "extracoes", label: "Extrações", href: "/loterias?tab=extracoes" },
  { id: "modalidades", label: "Modalidades", href: "/loterias?tab=modalidades" },
  { id: "cotacoes", label: "Cotações", href: "/loterias?tab=cotacoes" },
  { id: "instantanea", label: "Instantânea", href: "/instantanea" },
  { id: "sorteio", label: "Sorteio", href: "/sorteio" },
] as const;

export default function LoteriasTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") || "extracoes";

  const isActive = (id: (typeof tabs)[number]["id"]) => {
    if (id === "instantanea") return pathname === "/instantanea";
    if (id === "sorteio") return pathname === "/sorteio";
    return pathname === "/loterias" && tabParam === id;
  };

  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-gray-200">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={`rounded-t px-4 py-3 text-sm font-medium transition-colors ${
            isActive(t.id)
              ? "border-b-2 border-orange-500 bg-white text-orange-600 shadow-sm"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
