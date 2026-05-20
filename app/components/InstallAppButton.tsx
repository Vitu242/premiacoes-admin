"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type Variant = "primary" | "ghost";

interface Props {
  variant?: Variant;
  className?: string;
  label?: string;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if ((window.navigator as unknown as { standalone?: boolean }).standalone) return true;
  return false;
}

function detectPlatform():
  | "ios-safari"
  | "ios-chrome"
  | "android-chrome"
  | "android-firefox"
  | "android-samsung"
  | "desktop-chrome"
  | "desktop-edge"
  | "desktop-firefox"
  | "desktop-safari"
  | "outro" {
  if (typeof navigator === "undefined") return "outro";
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isAndroid = /Android/.test(ua);
  if (isIOS) return /CriOS|FxiOS/.test(ua) ? "ios-chrome" : "ios-safari";
  if (isAndroid) {
    if (/SamsungBrowser/.test(ua)) return "android-samsung";
    if (/Firefox/.test(ua)) return "android-firefox";
    return "android-chrome";
  }
  if (/Edg\//.test(ua)) return "desktop-edge";
  if (/Firefox/.test(ua)) return "desktop-firefox";
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) return "desktop-safari";
  return "desktop-chrome";
}

function isHttpsOk(): boolean {
  if (typeof window === "undefined") return true;
  const p = window.location.protocol;
  const h = window.location.hostname;
  return p === "https:" || h === "localhost" || h === "127.0.0.1";
}

const DownloadIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </svg>
);

const ShareIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0-12l-4 4m4-4l4 4M5 20h14" />
  </svg>
);

const PlusSquareIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
    <rect x="4" y="4" width="16" height="16" rx="3"/>
    <path strokeLinecap="round" d="M12 8v8M8 12h8"/>
  </svg>
);

const DotsIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>
  </svg>
);

/**
 * Pega o evento `beforeinstallprompt` que foi capturado pelo script do
 * `app/layout.tsx` e armazenado em `window.__deferredInstallPrompt`.
 * O Chrome emite esse evento UMA vez por sessão — qualquer componente que
 * tenta escutar depois do load original o perde. Por isso aqui lemos da
 * global, e o botão funciona em QUALQUER rota (inclusive na tela de login
 * do cliente, mesmo que o componente seja montado depois).
 */
function getGlobalDeferredPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __deferredInstallPrompt?: BeforeInstallPromptEvent | null };
  return w.__deferredInstallPrompt ?? null;
}

function setGlobalDeferredPrompt(value: BeforeInstallPromptEvent | null): void {
  if (typeof window === "undefined") return;
  (window as unknown as { __deferredInstallPrompt?: BeforeInstallPromptEvent | null }).__deferredInstallPrompt = value;
}

export default function InstallAppButton({ variant = "primary", className = "", label = "Baixar app" }: Props) {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    // 1) Se o evento já foi capturado globalmente (pelo script no <head>),
    //    usa ele imediatamente.
    const already = getGlobalDeferredPrompt();
    if (already) setEvent(already);

    // 2) Escuta tanto o evento nativo (caso ainda não tenha disparado) quanto
    //    o evento customizado "pwa-install-available" disparado pelo script
    //    global.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      setGlobalDeferredPrompt(evt);
      setEvent(evt);
    };
    const onAvailable = () => {
      const evt = getGlobalDeferredPrompt();
      if (evt) setEvent(evt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
      setGlobalDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("pwa-install-available", onAvailable as EventListener);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("pwa-installed", onInstalled as EventListener);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("pwa-install-available", onAvailable as EventListener);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("pwa-installed", onInstalled as EventListener);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    const promptEvt = event ?? getGlobalDeferredPrompt();
    if (promptEvt) {
      try {
        await promptEvt.prompt();
        const choice = await promptEvt.userChoice;
        if (choice.outcome === "accepted") setInstalled(true);
      } catch {}
      // Uma vez consumido, o navegador descarta o evento — limpamos a referência.
      setEvent(null);
      setGlobalDeferredPrompt(null);
      return;
    }
    setShowHelp(true);
  };

  const base =
    variant === "primary"
      ? "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-3 font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
      : "inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:bg-slate-800 dark:text-emerald-300 dark:hover:bg-slate-700";

  return (
    <>
      <button type="button" onClick={handleClick} className={`${base} ${className}`}>
        {DownloadIcon}
        <span>{label}</span>
      </button>

      {showHelp && <InstrucoesInstalacao onClose={() => setShowHelp(false)} />}
    </>
  );
}

function InstrucoesInstalacao({ onClose }: { onClose: () => void }) {
  const plat = detectPlatform();
  const httpsOk = isHttpsOk();

  let titulo = "Adicionar atalho à tela inicial";
  let passos: { text: React.ReactNode; icon?: React.ReactNode }[] = [];

  if (plat === "ios-safari") {
    titulo = "Instalar no iPhone (Safari)";
    passos = [
      { text: <>Toque no botão <strong>Compartilhar</strong> na barra inferior do Safari</>, icon: ShareIcon },
      { text: <>Role a lista e toque em <strong>“Adicionar à Tela de Início”</strong></>, icon: PlusSquareIcon },
      { text: <>Toque em <strong>“Adicionar”</strong> no canto superior direito</> },
    ];
  } else if (plat === "ios-chrome") {
    titulo = "Instalar no iPhone";
    passos = [
      { text: <>Abra este site no <strong>Safari</strong> (a instalação no iOS só funciona pelo Safari)</> },
      { text: <>No Safari, toque em <strong>Compartilhar</strong></>, icon: ShareIcon },
      { text: <>Toque em <strong>“Adicionar à Tela de Início”</strong></>, icon: PlusSquareIcon },
    ];
  } else if (plat === "android-chrome" || plat === "android-samsung" || plat === "android-firefox") {
    titulo = "Instalar no Android";
    passos = [
      { text: <>Toque no menu <strong>⋮</strong> no canto superior direito do navegador</>, icon: DotsIcon },
      { text: <>Toque em <strong>“Adicionar à tela inicial”</strong> ou <strong>“Instalar aplicativo”</strong></>, icon: PlusSquareIcon },
      { text: <>Confirme em <strong>“Adicionar”</strong></> },
    ];
  } else if (plat === "desktop-chrome" || plat === "desktop-edge") {
    titulo = "Instalar no computador";
    passos = [
      { text: <>Na barra de endereço, clique no ícone <strong>de instalação</strong> (geralmente um monitor com seta para baixo)</>, icon: DownloadIcon },
      { text: <>Se não aparecer, abra o menu <strong>⋮</strong> e procure <strong>“Instalar Premiações…”</strong></>, icon: DotsIcon },
      { text: <>Confirme em <strong>“Instalar”</strong></> },
    ];
  } else {
    passos = [
      { text: <>Abra o menu do seu navegador (geralmente <strong>⋮</strong> ou <strong>···</strong>)</>, icon: DotsIcon },
      { text: <>Procure por <strong>“Adicionar à tela inicial”</strong> ou <strong>“Instalar aplicativo”</strong></>, icon: PlusSquareIcon },
    ];
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-emerald-500 to-green-600 p-5 text-white">
          <div className="mb-2 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              {DownloadIcon}
            </div>
          </div>
          <h3 className="text-center text-lg font-bold">{titulo}</h3>
          <p className="mt-1 text-center text-xs text-white/90">
            Em 3 passos simples, o app vai aparecer como ícone na tela do seu celular.
          </p>
        </div>

        <div className="p-5">
          {!httpsOk && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
              <strong>Por que o botão não instalou direto?</strong>
              <br />
              A instalação automática só funciona em sites com cadeado{" "}
              <strong>https://</strong>. Mesmo assim, você pode criar o atalho manualmente
              seguindo os passos abaixo — funciona igualzinho.
            </div>
          )}

          <ol className="space-y-3">
            {passos.map((p, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm text-slate-700 dark:text-slate-200">{p.text}</p>
                </div>
                {p.icon && (
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {p.icon}
                  </span>
                )}
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700"
          >
            Entendi, vou fazer agora
          </button>
        </div>
      </div>
    </div>
  );
}
