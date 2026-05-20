"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getConfig } from "@/lib/store";
import { useConfigRefresh } from "@/lib/use-config-refresh";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  isVender?: boolean;
}

const Icons = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
    </svg>
  ),
  ticket: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 100 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 100-4V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 6v12" strokeDasharray="2 2" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v3h-4a3 3 0 100 6h4v3a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      <circle cx="18" cy="13" r="1" fill="currentColor" />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4M7 4h10v5a5 5 0 11-10 0V4zM7 4H5a2 2 0 00-2 2v1a3 3 0 003 3M17 4h2a2 2 0 012 2v1a3 3 0 01-3 3" />
    </svg>
  ),
  add: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-7 w-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  ),
};

const navItems: NavItem[] = [
  { href: "/cliente", label: "Início", icon: Icons.home },
  { href: "/cliente/bilhete", label: "Bilhetes", icon: Icons.ticket },
  { href: "/cliente/vender", label: "Vender", icon: Icons.add, isVender: true },
  { href: "/cliente/caixa", label: "Caixa", icon: Icons.wallet },
  { href: "/cliente/resultado", label: "Resultados", icon: Icons.trophy },
];

export function ClienteNavBar() {
  const pathname = usePathname();
  const [apostasAtivas, setApostasAtivas] = useState(true);

  useEffect(() => {
    setApostasAtivas(getConfig().apostasAtivas ?? true);
  }, []);

  useConfigRefresh((cfg) => setApostasAtivas(cfg.apostasAtivas ?? true));

  /**
   * Se o cambista estiver em /cliente/vender com bilhete em andamento (flag
   * `vender_em_andamento` setada pela própria tela quando há itens no
   * carrinho ou ele está em "confirmar"), pergunta antes de navegar para
   * outra aba do menu inferior.
   */
  const handleNavClick = (e: React.MouseEvent, href: string) => {
    if (typeof window === "undefined") return;
    if (pathname !== "/cliente/vender") return;
    if (href === "/cliente/vender") return;
    let emAndamento = false;
    try {
      emAndamento = sessionStorage.getItem("vender_em_andamento") === "1";
    } catch {
      /* ignore */
    }
    if (!emAndamento) return;
    const ok = window.confirm(
      "Deseja realmente sair? O bilhete em andamento será cancelado.",
    );
    if (!ok) {
      e.preventDefault();
      return;
    }
    try { sessionStorage.removeItem("vender_em_andamento"); } catch {}
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-screen-sm items-end justify-around px-2 py-1.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === "/cliente" && pathname === "/cliente");
          const isVenderOff = item.isVender && !apostasAtivas;

          if (item.isVender) {
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  if (isVenderOff) {
                    e.preventDefault();
                    return;
                  }
                  handleNavClick(e, item.href);
                }}
                aria-label="Vender"
                className={`relative -mt-6 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 ${
                  isVenderOff
                    ? "cursor-not-allowed bg-gray-300 text-gray-500"
                    : "bg-gradient-to-br from-emerald-500 to-green-600 text-white hover:shadow-emerald-500/40"
                }`}
              >
                {item.icon}
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => handleNavClick(e, item.href)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition-colors ${
                isActive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              <div className={isActive ? "scale-110" : ""}>{item.icon}</div>
              <span className={`text-[10px] font-medium ${isActive ? "" : "text-slate-600 dark:text-slate-300"}`}>
                {item.label}
              </span>
              {isActive && (
                <span className="mt-0.5 h-1 w-1 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
