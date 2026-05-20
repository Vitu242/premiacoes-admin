-- Snapshots periódicos do caixa de cada cambista, usados para restauração
-- caso o servidor caia, sync corrompa valores ou alguma operação derrube
-- entrada/saídas/comissão/lançamentos por engano.
--
-- Política de retenção tiered: 6h (1 a cada 30 min), 24h (1 por hora),
-- 7 dias (1 por dia), 30 dias (1 por semana). Aplicada em código a cada
-- novo snapshot — não em trigger.
--
-- COMO APLICAR: cole no SQL Editor do Supabase e execute uma vez.

create table if not exists public.caixa_snapshots (
  id text primary key,
  codigo text,
  criado_em timestamptz not null default now(),
  motivo text,
  total_cambistas integer not null default 0,
  total_caixa numeric not null default 0,
  hash text,
  snapshot jsonb not null
);

create index if not exists caixa_snapshots_criado_em_idx
  on public.caixa_snapshots (criado_em desc);

create index if not exists caixa_snapshots_codigo_criado_idx
  on public.caixa_snapshots (codigo, criado_em desc);

-- RLS: este table é acessado apenas por endpoints server-side com
-- service_role. Mantemos RLS habilitado para bloquear acesso anônimo.
alter table public.caixa_snapshots enable row level security;

-- Sem políticas => apenas service_role consegue ler/escrever.
