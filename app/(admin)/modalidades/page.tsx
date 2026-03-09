"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ModalidadesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/loterias?tab=modalidades");
  }, [router]);
  return (
    <div className="flex items-center justify-center p-8 text-gray-500">
      Redirecionando para Loterias...
    </div>
  );
}
