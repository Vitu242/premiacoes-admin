"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { getCambistas } from "@/lib/store";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const gridItems = [
  { href: "/cliente/bilhete", label: "Bilhete", icon: "🎫", subtitle: "Agsa" },
  { href: "/cliente/resultado", label: "Resultado", icon: "🏆", subtitle: "Agora" },
  { href: "/cliente/repetir", label: "Repetir", icon: "🔄", subtitle: "Agora" },
  { href: "/cliente/caixa", label: "Caixa", icon: "💰", subtitle: "Agora" },
  { href: "/cliente/regulamento", label: "Regulamento", icon: "📄", subtitle: "Agora" },
];

const navItems = [
  { href: "/cliente", label: "Inicio", icon: "🏠" },
  { href: "/cliente/vender", label: "Vender", icon: "💵" },
  { href: "/cliente/caixa", label: "Caixa", icon: "💳" },
  { href: "/cliente/resultado", label: "Resultados", icon: "🏆" },
];

export default function ClienteDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [cambista, setCambista] = useState<{
    id: string;
    login: string;
    saldo: number;
  } | null>(null);
  const [codigo, setCodigo] = useState("");

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente/login");
      return;
    }
    const { cambistaId, codigo: c } = JSON.parse(auth);
    setCodigo(c || "");
    const cambistas = getCambistas();
    const cam = cambistas.find((x) => x.id === cambistaId);
    if (cam) setCambista({ id: cam.id, login: cam.login, saldo: cam.saldo });
  }, [router]);

  const handleSair = () => {
    localStorage.removeItem("premiacoes_cliente");
    router.replace("/cliente/login");
  };

  if (!cambista) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-4">
        <div>
          <h1 className="text-lg font-bold text-gray-800">{cambista.login}</h1>
          <p className="text-sm text-gray-500">
            Banca: {codigo ? codigo.charAt(0).toUpperCase() + codigo.slice(1) : "Premiações"}
          </p>
        </div>
        <Link
          href="/cliente/configuracoes"
          className="rounded p-2 text-gray-500 hover:bg-gray-100"
          aria-label="Configurações"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
      </header>

      {/* Card Saldo */}
      <div className="mx-4 mt-4 rounded-xl bg-gray-100 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Saldo</p>
            <p className="text-2xl font-bold text-gray-800">
              {formatarMoeda(cambista.saldo)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500"></span>
            <span className="text-sm text-gray-600">Online</span>
          </div>
        </div>
      </div>

      {/* Botão Vender (destaque) - gradiente verde */}
      <div className="mx-4 mt-4">
        <Link
          href="/cliente/vender"
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-green-600 to-green-500 py-4 font-semibold text-white shadow-md transition-opacity hover:opacity-95"
        >
          <span className="text-2xl">💵</span>
          Vender
        </Link>
      </div>

      {/* Grid de funções - cards cinza claro */}
      <div className="mx-4 mt-6 grid grid-cols-2 gap-4">
        {gridItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center justify-center rounded-xl bg-gray-100 p-6 transition-colors hover:bg-gray-200"
          >
            <span className="mb-2 text-3xl">{item.icon}</span>
            <span className="font-medium text-gray-800">{item.label}</span>
            <span className="mt-1 text-xs text-gray-500">= {item.subtitle}</span>
          </Link>
        ))}
      </div>

      {/* Botão Sair */}
      <div className="mx-4 mt-6">
        <button
          onClick={handleSair}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 transition-colors hover:bg-gray-50"
        >
          <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="font-medium text-gray-700">Sair</span>
        </button>
      </div>

      {/* Versão */}
      <p className="mt-6 text-center text-sm text-gray-400">versão 1.0.0</p>

      {/* Barra de navegação inferior */}
      <nav className="fixed bottom-0 left-0 right-0 flex justify-around border-t border-gray-200 bg-white py-2 pb-6">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href === "/cliente" && pathname === "/cliente");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 rounded-lg px-4 py-2 ${
                isActive ? "bg-green-100 text-green-700" : "text-gray-500"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
