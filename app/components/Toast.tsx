"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * Sistema de popup/toast usado em todo o painel admin.
 *
 * Como usar:
 *   const toast = useToast();
 *   toast.success("Configuração salva com sucesso!");
 *   toast.error("Falha ao salvar.");
 *   toast.info("Atualizando...");
 *
 * O popup aparece no canto inferior direito, fecha sozinho em ~3 segundos, e
 * empilha vários ao mesmo tempo.
 */

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  show: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    const noop = () => {};
    return { show: noop, success: noop, error: noop, info: noop, warning: noop };
  }
  return ctx;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8h.01M12 12v4" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  ),
};

const STYLES: Record<ToastType, string> = {
  success: "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950/80 dark:text-emerald-100",
  error: "border-rose-500 bg-rose-50 text-rose-900 dark:border-rose-400 dark:bg-rose-950/80 dark:text-rose-100",
  info: "border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950/80 dark:text-blue-100",
  warning: "border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-400 dark:bg-amber-950/80 dark:text-amber-100",
};

const ICON_BG: Record<ToastType, string> = {
  success: "bg-emerald-500 text-white",
  error: "bg-rose-500 text-white",
  info: "bg-blue-500 text-white",
  warning: "bg-amber-500 text-white",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback((type: ToastType, message: string) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show("success", m),
      error: (m) => show("error", m),
      info: (m) => show("info", m),
      warning: (m) => show("warning", m),
    }),
    [show],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[10000] flex max-w-sm flex-col gap-2"
        aria-live="polite"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onClose={() => setItems((prev) => prev.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`pointer-events-auto flex min-w-[260px] items-center gap-3 rounded-xl border-l-4 px-4 py-3 shadow-2xl transition-all duration-200 ${STYLES[item.type]} ${visible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"}`}
      role="status"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ICON_BG[item.type]}`}>
        {ICONS[item.type]}
      </span>
      <p className="flex-1 text-sm font-medium">{item.message}</p>
      <button
        type="button"
        onClick={onClose}
        className="ml-1 rounded-full p-1 text-current opacity-60 hover:bg-black/10 hover:opacity-100"
        aria-label="Fechar"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
