"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClienteNavBar } from "./ClienteNavBar";

const CLIENTE_PUBLIC_PATHS = ["/cliente/login"];

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
      router.replace("/cliente/login");
      return;
    }
    setAutorizado(true);
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
