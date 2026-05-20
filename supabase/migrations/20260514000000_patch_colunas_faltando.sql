-- ============================================================
-- PATCH DE SCHEMA — colunas/políticas que o app passou a usar
-- Seguro: tudo idempotente (IF NOT EXISTS / DO blocks com EXCEPTION).
-- Rode UMA VEZ no SQL Editor do Supabase do projeto reativado.
-- ============================================================

-- ---- GERENTES ----------------------------------------------------------
ALTER TABLE gerentes ADD COLUMN IF NOT EXISTS codigo TEXT DEFAULT 'default';
ALTER TABLE gerentes ADD COLUMN IF NOT EXISTS tipo TEXT;
ALTER TABLE gerentes ADD COLUMN IF NOT EXISTS contas_socio TEXT;
ALTER TABLE gerentes ADD COLUMN IF NOT EXISTS criar_cambista BOOLEAN DEFAULT false;
ALTER TABLE gerentes ADD COLUMN IF NOT EXISTS adicionar_saldo BOOLEAN DEFAULT false;
ALTER TABLE gerentes ADD COLUMN IF NOT EXISTS comissao_bruto NUMERIC DEFAULT 0;
ALTER TABLE gerentes ADD COLUMN IF NOT EXISTS comissao_lucro NUMERIC DEFAULT 0;
ALTER TABLE gerentes ADD COLUMN IF NOT EXISTS criado_em TEXT;

-- ---- CAMBISTAS ---------------------------------------------------------
ALTER TABLE cambistas ADD COLUMN IF NOT EXISTS codigo TEXT DEFAULT 'default';
ALTER TABLE cambistas ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'cambista';
ALTER TABLE cambistas ADD COLUMN IF NOT EXISTS cotacoes JSONB;
ALTER TABLE cambistas ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMPTZ;
ALTER TABLE cambistas ADD COLUMN IF NOT EXISTS milhar_brinde TEXT DEFAULT 'nao';

-- ---- EXTRAÇÕES ---------------------------------------------------------
ALTER TABLE extracoes ADD COLUMN IF NOT EXISTS tipo TEXT;
ALTER TABLE extracoes ADD COLUMN IF NOT EXISTS dias JSONB;

-- ---- RESULTADOS --------------------------------------------------------
ALTER TABLE resultados ADD COLUMN IF NOT EXISTS premios JSONB;
ALTER TABLE resultados ADD COLUMN IF NOT EXISTS dezenas TEXT;

-- ---- CONFIG ------------------------------------------------------------
-- Cria se não existir; se existir com coluna "key" no lugar de "id", renomeia.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'config') THEN
    CREATE TABLE config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      value JSONB,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'config' AND column_name = 'key'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'config' AND column_name = 'id'
  ) THEN
    ALTER TABLE config RENAME COLUMN key TO id;
  END IF;
END $$;

-- ---- ADMIN_CREDENCIAIS -------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_credenciais (
  codigo TEXT PRIMARY KEY,
  admin TEXT,
  senha TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---- RLS aberto (MVP; depois apertar com auth.role()) ------------------
ALTER TABLE gerentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cambistas ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bilhetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE resultados ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_credenciais ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  BEGIN CREATE POLICY "Allow all gerentes" ON gerentes FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "Allow all cambistas" ON cambistas FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "Allow all extracoes" ON extracoes FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "Allow all bilhetes" ON bilhetes FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "Allow all lancamentos" ON lancamentos FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "Allow all resultados" ON resultados FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "Allow all config" ON config FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "Allow all admin_credenciais" ON admin_credenciais FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ---- Realtime publication ---------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE bilhetes; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE resultados; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE cambistas; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE config; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- ---- Verificação --------------------------------------------------------
-- Esta query deve retornar TODAS as colunas críticas; útil para auditoria.
-- (Não falha se faltar; só lista o que existe.)
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('gerentes','cambistas','bilhetes','resultados','lancamentos','config','admin_credenciais','extracoes')
ORDER BY table_name, ordinal_position;
