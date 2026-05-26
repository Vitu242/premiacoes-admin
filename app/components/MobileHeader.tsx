"use client";

import { useTheme } from "./ThemeProvider";
import { useBranding } from "./BrandingProvider";
import { AlertasSinoMobile } from "./AlertasSinoMobile";

interface MobileHeaderProps {
  onMenuClick: () => void;
}

export default function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const { resolved, toggle } = useTheme();
  const { branding } = useBranding();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 md:hidden print:hidden">
      <button
        onClick={onMenuClick}
        className="rounded p-2 text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label="Abrir menu"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <span className="truncate text-sm font-medium text-gray-700 dark:text-slate-200">
        {branding.displayName || "Painel Admin"}
      </span>
      <div className="flex items-center gap-1">
        <AlertasSinoMobile />
        <button
          type="button"
          onClick={toggle}
          className="rounded p-2 text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Alternar tema"
          title="Alternar tema"
        >
          {resolved === "dark" ? "☀️" : "🌙"}
        </button>
      </div>
    </header>
  );
}
