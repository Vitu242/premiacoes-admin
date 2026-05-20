"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // SW só pode ser registrado em https ou localhost. Tentar em HTTP comum lança erro.
    const isSecure =
      window.isSecureContext ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (!isSecure) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // Checa atualização imediatamente e a cada 5 min. Sem isso,
          // browsers só revalidam o SW de tempos em tempos (até 24h),
          // o que mantém PWAs presos em versões antigas.
          reg.update().catch(() => null);
          intervalId = setInterval(() => {
            reg.update().catch(() => null);
          }, 5 * 60 * 1000);
          // Também checa quando a aba volta a ficar visível
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
              reg.update().catch(() => null);
            }
          });
        })
        .catch(() => {
          /* ignore */
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => {
      window.removeEventListener("load", onLoad);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return null;
}
