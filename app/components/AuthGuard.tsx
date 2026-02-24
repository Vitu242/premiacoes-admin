"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const auth = localStorage.getItem("premiacoes_admin");
    if (!auth) {
      router.replace("/login");
      return;
    }
    setAutorizado(true);
  }, [router]);

  if (!autorizado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Verificando acesso...</p>
      </div>
    );
  }

  return <>{children}</>;
}
