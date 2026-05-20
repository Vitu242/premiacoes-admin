-- Migração de endurecimento de segurança (Onda 1).
-- Aplicar manualmente no SQL Editor do Supabase quando estiver pronto para
-- restringir leitura/escrita por código de banca.
--
-- IMPORTANTE: Esta migração mantém compatibilidade com o app atual
-- enquanto adiciona campos para auth real. As políticas "Allow all" originais
-- são substituídas por políticas baseadas no header request.code (custom claim)
-- ou no usuário autenticado (auth.uid()).

-- 1) Garante colunas
ALTER TABLE IF EXISTS cambistas
  ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'cambista',
  ADD COLUMN IF NOT EXISTS codigo TEXT DEFAULT 'default';

ALTER TABLE IF EXISTS gerentes
  ADD COLUMN IF NOT EXISTS codigo TEXT DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS contas_socio TEXT;

ALTER TABLE IF EXISTS bilhetes
  ADD COLUMN IF NOT EXISTS codigo_banca TEXT,
  ADD COLUMN IF NOT EXISTS soft_deleted_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS resultados
  ADD COLUMN IF NOT EXISTS codigo_banca TEXT;

-- 2) Índices
CREATE INDEX IF NOT EXISTS idx_cambistas_codigo ON cambistas (codigo);
CREATE INDEX IF NOT EXISTS idx_gerentes_codigo ON gerentes (codigo);
CREATE INDEX IF NOT EXISTS idx_bilhetes_cambista ON bilhetes (cambista_id);
CREATE INDEX IF NOT EXISTS idx_bilhetes_data ON bilhetes (data);
CREATE INDEX IF NOT EXISTS idx_resultados_ext_data ON resultados (extracao_id, data);
CREATE INDEX IF NOT EXISTS idx_lancamentos_cambista ON lancamentos (cambista_id);

-- 3) Tabela de organizações (futuro multi-tenant real)
CREATE TABLE IF NOT EXISTS bancas (
  codigo TEXT PRIMARY KEY,
  nome TEXT,
  logo_url TEXT,
  cor_primaria TEXT DEFAULT '#f97316',
  bilhete_rodape TEXT,
  criado_em TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4) Logs centralizados (substitui localStorage)
CREATE TABLE IF NOT EXISTS auditoria (
  id TEXT PRIMARY KEY,
  data TIMESTAMPTZ DEFAULT now(),
  codigo TEXT,
  admin TEXT,
  acao TEXT,
  detalhes TEXT
);
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

-- 5) RLS endurecida (opcional — execute quando estiver pronto para Auth real).
-- Por enquanto MANTEMOS compat. Para ativar:
--
--   1) Faça login no Supabase Auth com cada admin de banca.
--   2) Em `auth.users.raw_user_meta_data` salve {"codigo": "Lotobrasil"}.
--   3) Substitua as policies por:
--
-- DROP POLICY IF EXISTS "Allow all cambistas" ON cambistas;
-- CREATE POLICY "tenant_select cambistas" ON cambistas FOR SELECT TO authenticated
--   USING (codigo = (auth.jwt() -> 'user_metadata' ->> 'codigo'));
-- CREATE POLICY "tenant_modify cambistas" ON cambistas FOR ALL TO authenticated
--   USING (codigo = (auth.jwt() -> 'user_metadata' ->> 'codigo'))
--   WITH CHECK (codigo = (auth.jwt() -> 'user_metadata' ->> 'codigo'));
--
-- Repita para gerentes, bilhetes, resultados, lancamentos, config, admin_credenciais.

-- 6) Habilita Realtime publication (se ainda não estiver)
DO $$
BEGIN
  PERFORM 1 FROM pg_publication WHERE pubname = 'supabase_realtime';
  IF FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE bilhetes';
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE resultados';
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE cambistas';
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE config';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- tabelas já podem estar na publicação; ignore.
  NULL;
END $$;
