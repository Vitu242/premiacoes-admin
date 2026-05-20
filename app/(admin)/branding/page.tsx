"use client";

import { useEffect, useRef, useState } from "react";
import { useBranding, BRANDING_DEFAULT } from "@/app/components/BrandingProvider";
import { useTheme } from "@/app/components/ThemeProvider";
import { addLog } from "@/lib/auditoria";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function BrandingPage() {
  const { branding, setBranding, reset } = useBranding();
  const { theme, setTheme } = useTheme();
  const [local, setLocal] = useState(branding);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setLocal(branding), [branding]);

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 500_000) {
      setMsg("Logo muito grande. Máx 500 KB (use PNG/SVG pequeno).");
      return;
    }
    const dataUrl = await fileToDataUrl(f);
    setLocal({ ...local, logoUrl: dataUrl });
  };

  const salvar = () => {
    setBranding(local);
    addLog("Atualizou branding", local.displayName ?? "");
    setMsg("Salvo com sucesso.");
    setTimeout(() => setMsg(null), 2500);
  };

  const resetar = () => {
    if (!confirm("Restaurar branding padrão?")) return;
    reset();
    setLocal(BRANDING_DEFAULT);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold text-gray-800">Aparência e Branding</h1>
      <p className="mb-6 text-sm text-gray-600">
        Personalize o nome da banca, o logo, as cores e o rodapé do bilhete. As mudanças
        ficam armazenadas no dispositivo deste navegador.
      </p>

      {msg && (
        <p className="mb-4 rounded bg-green-50 p-2 text-sm text-green-700">{msg}</p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-800">Identidade</h2>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-gray-700">Nome de exibição</span>
            <input
              type="text"
              placeholder="ex.: Lotobrasil Premiações"
              value={local.displayName ?? ""}
              onChange={(e) => setLocal({ ...local, displayName: e.target.value })}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-gray-700">Rodapé do bilhete</span>
            <textarea
              rows={3}
              placeholder="Texto exibido ao final dos bilhetes impressos"
              value={local.bilheteRodape ?? ""}
              onChange={(e) => setLocal({ ...local, bilheteRodape: e.target.value })}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="mb-2 block text-sm">
            <span className="mb-1 block text-gray-700">Logo (PNG/SVG)</span>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickLogo} />
          </label>
          {local.logoUrl && (
            <div className="mt-2 inline-flex items-center gap-3 rounded border border-dashed border-gray-300 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={local.logoUrl} alt="logo" className="h-12 max-w-[120px]" />
              <button
                type="button"
                onClick={() => setLocal({ ...local, logoUrl: null })}
                className="text-xs text-red-600 hover:underline"
              >
                Remover
              </button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-800">Cores</h2>
          <label className="mb-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-700">Cor primária</span>
            <input
              type="color"
              value={local.primary}
              onChange={(e) => setLocal({ ...local, primary: e.target.value })}
              className="h-8 w-12 cursor-pointer"
            />
          </label>
          <label className="mb-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-700">Cor primária — hover</span>
            <input
              type="color"
              value={local.primaryHover}
              onChange={(e) => setLocal({ ...local, primaryHover: e.target.value })}
              className="h-8 w-12 cursor-pointer"
            />
          </label>
          <label className="mb-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-700">Cor do texto sobre primária</span>
            <input
              type="color"
              value={local.primaryFg}
              onChange={(e) => setLocal({ ...local, primaryFg: e.target.value })}
              className="h-8 w-12 cursor-pointer"
            />
          </label>

          <h2 className="mb-3 mt-6 text-base font-semibold text-gray-800">Tema</h2>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`rounded border px-3 py-1.5 text-sm capitalize ${
                  theme === t ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-300 text-gray-700"
                }`}
              >
                {t === "light" ? "Claro" : t === "dark" ? "Escuro" : "Sistema"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-gray-800">Pré-visualização</h2>
        <div
          className="rounded-md p-4 text-white"
          style={{ backgroundColor: local.primary, color: local.primaryFg }}
        >
          <div className="flex items-center gap-3">
            {local.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={local.logoUrl} alt="logo" className="h-10" />
            )}
            <strong>{local.displayName || "Premiações Admin"}</strong>
          </div>
          <button
            type="button"
            className="mt-3 rounded px-3 py-1.5 text-sm font-medium"
            style={{ backgroundColor: local.primaryHover, color: local.primaryFg }}
          >
            Botão de exemplo
          </button>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={salvar}
          className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={resetar}
          className="rounded border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
        >
          Restaurar padrão
        </button>
      </div>
    </div>
  );
}
