"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getConfig } from "@/lib/store";
import { useConfigRefresh } from "@/lib/use-config-refresh";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/cliente", label: "Inicio", icon: "🏠" },
  { href: "/cliente/vender", label: "Vender", icon: "💵" },
  { href: "/cliente/caixa", label: "Caixa", icon: "💳" },
  { href: "/cliente/resultado", label: "Resultados", icon: "🏆" },
];

export function ClienteNavBar() {
  const pathname = usePathname();
  const [apostasAtivas, setApostasAtivas] = useState(true);

  useEffect(() => {
    const cfg = getConfig();
    setApostasAtivas(cfg.apostasAtivas ?? true);
  }, []);

  useConfigRefresh((cfg) => setApostasAtivas(cfg.apostasAtivas ?? true));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around border-t border-gray-200 bg-white py-2 pb-6">
      {navItems.map((item) => {
        const isActive =
          pathname === item.href || (item.href === "/cliente" && pathname === "/cliente");
        const isVenderDesativado = item.href === "/cliente/vender" && !apostasAtivas;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 rounded-lg px-4 py-2 ${
              isVenderDesativado
                ? "cursor-not-allowed text-gray-300"
                : isActive
                  ? "bg-green-100 text-green-700"
                  : "text-gray-500"
            }`}
            onClick={(e) => isVenderDesativado && e.preventDefault()}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-xs font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
