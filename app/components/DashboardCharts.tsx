"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

interface DonutDatum {
  name: string;
  value: number;
}

const DONUT_PALETTE = [
  "#0ea5e9",
  "#f97316",
  "#22c55e",
  "#a855f7",
  "#ef4444",
  "#facc15",
  "#06b6d4",
  "#ec4899",
  "#10b981",
  "#3b82f6",
];

interface DonutCardProps {
  title: string;
  data: DonutDatum[];
  emptyLabel?: string;
}

export function DonutCard({ title, data, emptyLabel }: DonutCardProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const semDados = total <= 0;
  const labeled = data.map((d) => ({
    ...d,
    pct: total > 0 ? Math.round((d.value / total) * 100) : 0,
  }));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 rounded-md bg-gray-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">
        {title}
      </div>
      {semDados ? (
        <div className="flex h-48 items-center justify-center text-sm text-gray-400">
          {emptyLabel ?? "Sem dados no período"}
        </div>
      ) : (
        <>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={labeled}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={(entry: unknown) => {
                    const e = entry as { pct?: number } | null;
                    const pct = e?.pct ?? 0;
                    return pct >= 8 ? `${pct}%` : "";
                  }}
                  labelLine={false}
                >
                  {labeled.map((_, i) => (
                    <Cell key={i} fill={DONUT_PALETTE[i % DONUT_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: unknown) => {
                    const n = typeof v === "number" ? v : Number(v ?? 0);
                    return n.toLocaleString("pt-BR");
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1">
            {labeled.map((d, i) => (
              <li
                key={`${d.name}-${i}`}
                className="flex items-center gap-2 text-xs text-gray-700"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: DONUT_PALETTE[i % DONUT_PALETTE.length],
                  }}
                />
                <span className="flex-1 truncate">{d.name}</span>
                <span className="font-semibold tabular-nums">{d.pct}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
