"use client";

import { useEffect, useState } from "react";
import { getConfig, setConfig } from "@/lib/store";
import { addLog } from "@/lib/auditoria";
import type { ComissoesPadrao } from "@/lib/store";

export default function ComissoesPage() {
  const [form, setForm] = useState<ComissoesPadrao>({
    comissaoMilhar: 20,
    comissaoCentena: 20,
    comissaoDezena: 17,
    comissaoGrupo: 17,
  });
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    const cfg = getConfig();
    const padrao = cfg.comissoesPadrao ?? {
      comissaoMilhar: 20,
      comissaoCentena: 20,
      comissaoDezena: 17,
      comissaoGrupo: 17,
    };
    setForm(padrao);
  }, []);

  const salvar = () => {
    setConfig({ comissoesPadrao: form });
    addLog("Comissões padrão", `M:${form.comissaoMilhar}% C:${form.comissaoCentena}% D:${form.comissaoDezena}% G:${form.comissaoGrupo}%`);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2000);
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">
        Comissões padrão
      </h1>
      <p className="mb-6 text-sm text-gray-600">
        Estes percentuais serão usados como padrão ao criar um novo cambista.
        Cada base cobre várias modalidades: Grupo (bolão, duque/terno/passe de grupo), Dezena (duque/terno de dezena), Centena (incl. invertidas), Milhar (incl. milhar e centena, MC invertida).
      </p>

      <div className="max-w-md space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Comissão Milhar (%)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={form.comissaoMilhar}
            onChange={(e) =>
              setForm({ ...form, comissaoMilhar: Number(e.target.value) })
            }
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Comissão Centena (%)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={form.comissaoCentena}
            onChange={(e) =>
              setForm({ ...form, comissaoCentena: Number(e.target.value) })
            }
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Comissão Dezena (%)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={form.comissaoDezena}
            onChange={(e) =>
              setForm({ ...form, comissaoDezena: Number(e.target.value) })
            }
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Comissão Grupo / Bolão (%)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={form.comissaoGrupo}
            onChange={(e) =>
              setForm({ ...form, comissaoGrupo: Number(e.target.value) })
            }
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
        <button
          onClick={salvar}
          className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
        >
          {salvo ? "Salvo!" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
