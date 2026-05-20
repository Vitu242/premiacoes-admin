"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClienteNavBar } from "./ClienteNavBar";
import { getCambistas } from "@/lib/store";
import { SYNC_COMPLETE_EVENT } from "@/lib/use-config-refresh";

const CLIENTE_PUBLIC_PATHS = ["/cliente/login"];

/**
 * Verifica se a sessão local foi explicitamente invalidada
 * (cambista marcado como "excluido" no store).
 *
 * IMPORTANTE: não devolve `false` apenas porque o cambista não está na
 * lista — o sync com Supabase pode estar em transição e o `localStorage`
 * pode estar temporariamente sem dados. Derrubar o usuário no meio de um
 * fluxo (ex.: montagem de bilhete na tela de venda) por causa de um lapso
 * de sincronização é pior que adiar a invalidação. A própria home
 * (`app/cliente/page.tsx`) faz a checagem definitiva quando o usuário
 * volta para ela.
 */
function sessaoExplicitamenteInvalida(): boolean {
  if (typeof window === "undefined") return false;
  let cambistaId = "";
  try {
    const raw = localStorage.getItem("premiacoes_cliente");
    if (!raw) return false; // sem sessão é tratado fora
    cambistaId = (JSON.parse(raw) as { cambistaId?: string }).cambistaId ?? "";
  } catch {
    return true; // sessão corrompida
  }
  if (!cambistaId) return true;
  const lista = getCambistas();
  if (!lista.length) return false; // sync em transição: dá benefício da dúvida
  const cam = lista.find((c) => c.id === cambistaId);
  if (cam && cam.status === "excluido") return true;
  return false;
}

export default function ClienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);

  useEffect(() => {
    if (CLIENTE_PUBLIC_PATHS.includes(pathname)) {
      setAutorizado(true);
      return;
    }

    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      // SEM sessão local: precisa logar. Mandamos para o login só nesta
      // condição específica (e no caso de exclusão explícita logo abaixo).
      router.replace("/cliente/login");
      return;
    }
    if (sessaoExplicitamenteInvalida()) {
      try { localStorage.removeItem("premiacoes_cliente"); } catch {}
      router.replace("/cliente/login");
      return;
    }
    setAutorizado(true);

    // SYNC: só derruba para o login se o cambista foi explicitamente
    // marcado como "excluido". Nunca por simples ausência na lista local
    // (sync pode estar em transição).
    const onSync = () => {
      if (sessaoExplicitamenteInvalida()) {
        try { localStorage.removeItem("premiacoes_cliente"); } catch {}
        router.replace("/cliente/login");
      }
    };
    window.addEventListener(SYNC_COMPLETE_EVENT, onSync);
    return () => window.removeEventListener(SYNC_COMPLETE_EVENT, onSync);
  }, [pathname, router]);

  if (!autorizado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Verificando acesso...</p>
      </div>
    );
  }

  const mostraNav = !CLIENTE_PUBLIC_PATHS.includes(pathname);

  return (
    <>
      {children}
      {mostraNav && <ClienteNavBar />}
    </>
  );
}
