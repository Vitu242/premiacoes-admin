"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAdminCodigo, CODIGO_CHEFE } from "@/lib/auth";
import { contarAlertasPendentes } from "@/lib/alertas";

const menuItems = [
  { href: "/", label: "Prestar Contas" },
  { href: "/alertas", label: "Alertas", badge: "alertas" as const },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/atividade", label: "Atividade ao vivo" },
  { href: "/cambistas", label: "Cambistas" },
  { href: "/gerentes", label: "Gerentes" },
  { href: "/saldo", label: "Saldo" },
  { href: "/caixa", label: "Caixa" },
  { href: "/venda", label: "Venda" },
  { href: "/bilhetes", label: "Bilhetes" },
  { href: "/lancamentos", label: "Lançamentos" },
  { href: "/resultados", label: "Resultados" },
  { href: "/loterias", label: "Loterias" },
  { href: "/configuracoes", label: "Configurações" },
  { href: "/branding", label: "Aparência" },
  { href: "/regulamento", label: "Regulamento" },
  { href: "/auditoria", label: "Auditoria" },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname();
  const codigo = getAdminCodigo();
  const isChefe = codigo === CODIGO_CHEFE;
  const [alertasPendentes, setAlertasPendentes] = useState(0);

  useEffect(() => {
    const refresh = () => setAlertasPendentes(contarAlertasPendentes());
    refresh();
    const onChange = () => refresh();
    window.addEventListener("premiacoes_alertas_changed", onChange);
    const id = setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener("premiacoes_alertas_changed", onChange);
      clearInterval(id);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("premiacoes_admin");
    window.location.href = "/login";
  };

  const handleLinkClick = () => {
    onClose?.();
  };

  return (
    <>
      {/* Overlay no mobile quando menu aberto */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden print:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar - no mobile fica oculto, no desktop sempre visível */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-56 shrink-0 flex-col bg-gray-800 text-white transition-transform duration-300 ease-in-out md:relative md:translate-x-0 print:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
          {isChefe && (
            <Link
              href="/gerir-admins"
              onClick={handleLinkClick}
              className={`rounded px-4 py-3 text-sm transition-colors ${
                pathname === "/gerir-admins"
                  ? "bg-orange-500/90 text-white"
                  : "text-amber-200 hover:bg-gray-700 hover:text-white"
              }`}
            >
              Gerir admins
            </Link>
          )}
          {menuItems.map((item) => {
            const ativo =
              pathname === item.href ||
              (item.href === "/loterias" &&
                (pathname === "/instantanea" || pathname === "/sorteio"));
            const showBadge =
              item.badge === "alertas" && alertasPendentes > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleLinkClick}
                className={`flex items-center justify-between rounded px-4 py-3 text-sm transition-colors ${
                  ativo
                    ? "bg-orange-500/90 text-white"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                <span>{item.label}</span>
                {showBadge && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                    {alertasPendentes > 99 ? "99+" : alertasPendentes}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={() => {
            handleLogout();
            handleLinkClick();
          }}
          className="m-4 rounded px-4 py-3 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
        >
          Sair
        </button>
      </aside>
    </>
  );
}
