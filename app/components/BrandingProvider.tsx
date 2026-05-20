"use client";

import { createContext, useContext, useEffect, useState } from "react";

export interface Branding {
  /** Cor primária da banca (hex, ex: "#f97316") */
  primary: string;
  /** Cor de hover da primária (hex) */
  primaryHover: string;
  /** Cor do texto sobre a primária (geralmente "#ffffff" ou "#171717") */
  primaryFg: string;
  /** Logo em base64 ou URL (opcional) */
  logoUrl?: string | null;
  /** Nome de exibição da banca (opcional, sobrescreve "Premiações") */
  displayName?: string | null;
  /** Rodapé customizado de bilhete (opcional) */
  bilheteRodape?: string | null;
}

export const BRANDING_KEY = "premiacoes_branding";

export const BRANDING_DEFAULT: Branding = {
  primary: "#f97316",
  primaryHover: "#ea580c",
  primaryFg: "#ffffff",
  logoUrl: null,
  displayName: null,
  bilheteRodape: null,
};

function loadBranding(): Branding {
  if (typeof window === "undefined") return BRANDING_DEFAULT;
  try {
    const raw = localStorage.getItem(BRANDING_KEY);
    if (!raw) return BRANDING_DEFAULT;
    const parsed = JSON.parse(raw);
    return { ...BRANDING_DEFAULT, ...parsed };
  } catch {
    return BRANDING_DEFAULT;
  }
}

function saveBranding(b: Branding) {
  if (typeof window !== "undefined") {
    localStorage.setItem(BRANDING_KEY, JSON.stringify(b));
  }
}

function applyBrandingToCss(b: Branding) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", b.primary);
  root.style.setProperty("--brand-primary-hover", b.primaryHover);
  root.style.setProperty("--brand-primary-fg", b.primaryFg);
}

interface BrandingCtx {
  branding: Branding;
  setBranding: (b: Partial<Branding>) => void;
  reset: () => void;
}

const Ctx = createContext<BrandingCtx>({
  branding: BRANDING_DEFAULT,
  setBranding: () => {},
  reset: () => {},
});

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setState] = useState<Branding>(BRANDING_DEFAULT);

  useEffect(() => {
    const b = loadBranding();
    setState(b);
    applyBrandingToCss(b);
  }, []);

  const setBranding = (b: Partial<Branding>) => {
    const novo = { ...branding, ...b };
    setState(novo);
    saveBranding(novo);
    applyBrandingToCss(novo);
  };

  const reset = () => {
    saveBranding(BRANDING_DEFAULT);
    setState(BRANDING_DEFAULT);
    applyBrandingToCss(BRANDING_DEFAULT);
  };

  return (
    <Ctx.Provider value={{ branding, setBranding, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBranding() {
  return useContext(Ctx);
}
