"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const CLIENTE_PUBLIC_PATHS = ["/cliente/login"];

export default function ClienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (CLIENTE_PUBLIC_PATHS.includes(pathname)) return;

    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente/login");
    }
  }, [pathname, router]);

  return <>{children}</>;
}
