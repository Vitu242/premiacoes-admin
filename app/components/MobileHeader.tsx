"use client";

interface MobileHeaderProps {
  onMenuClick: () => void;
}

export default function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:hidden">
      <button
        onClick={onMenuClick}
        className="rounded p-2 text-gray-600 hover:bg-gray-100"
        aria-label="Abrir menu"
      >
        <svg
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>
      <span className="text-sm font-medium text-gray-700">Painel Admin</span>
      <div className="w-10" />
    </header>
  );
}
