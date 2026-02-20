-- Schema para unificação de dados (Supabase/PostgreSQL)
-- Execute no SQL Editor do Supabase após criar o projeto

-- Gerentes
CREATE TABLE IF NOT EXISTS gerentes (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  senha TEXT NOT NULL,
  tipo TEXT,
  comissao_bruto NUMERIC DEFAULT 0,
  comissao_lucro NUMERIC DEFAULT 0,
  endereco TEXT,
  telefone TEXT,
  descricao TEXT,
  criar_cambista BOOLEAN DEFAULT false,
  adicionar_saldo BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'ativo',
  socio TEXT,
  criado_em TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Cambistas
CREATE TABLE IF NOT EXISTS cambistas (
  id TEXT PRIMARY KEY,
  gerente_id TEXT REFERENCES gerentes(id),
  login TEXT NOT NULL,
  senha TEXT NOT NULL,
  saldo NUMERIC DEFAULT 0,
  comissao_milhar NUMERIC DEFAULT 20,
  comissao_centena NUMERIC DEFAULT 20,
  comissao_dezena NUMERIC DEFAULT 17,
  comissao_grupo NUMERIC DEFAULT 17,
  cotacao_m NUMERIC DEFAULT 6000,
  cotacao_c NUMERIC DEFAULT 800,
  cotacao_d NUMERIC DEFAULT 80,
  cotacao_g NUMERIC DEFAULT 20,
  milhar_brinde TEXT DEFAULT 'nao',
  endereco TEXT,
  telefone TEXT,
  descricao TEXT,
  status TEXT DEFAULT 'ativo',
  risco TEXT,
  entrada NUMERIC DEFAULT 0,
  saidas NUMERIC DEFAULT 0,
  comissao NUMERIC DEFAULT 0,
  lancamentos NUMERIC DEFAULT 0,
  ultima_prestacao TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Extrações
CREATE TABLE IF NOT EXISTS extracoes (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  encerra TEXT,
  ativa BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Bilhetes
CREATE TABLE IF NOT EXISTS bilhetes (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL,
  cambista_id TEXT REFERENCES cambistas(id),
  extracao_id TEXT,
  extracao_nome TEXT,
  itens JSONB,
  total NUMERIC,
  data TEXT,
  situacao TEXT DEFAULT 'pendente',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lançamentos
CREATE TABLE IF NOT EXISTS lancamentos (
  id TEXT PRIMARY KEY,
  cambista_id TEXT REFERENCES cambistas(id),
  tipo TEXT,
  valor NUMERIC,
  data TEXT,
  observacao TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Resultados
CREATE TABLE IF NOT EXISTS resultados (
  id TEXT PRIMARY KEY,
  extracao_id TEXT,
  extracao_nome TEXT,
  data TEXT,
  grupos TEXT,
  dezenas TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Config
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Credenciais admin (por código)
CREATE TABLE IF NOT EXISTS admin_credenciais (
  codigo TEXT PRIMARY KEY,
  admin TEXT,
  senha TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS (Row Level Security) - permissões abertas para anon (ajustar em produção)
ALTER TABLE gerentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cambistas ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bilhetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE resultados ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_credenciais ENABLE ROW LEVEL SECURITY;

-- Políticas: permitir tudo para anon (em produção, usar auth.role() para restringir)
CREATE POLICY "Allow all gerentes" ON gerentes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all cambistas" ON cambistas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all extracoes" ON extracoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all bilhetes" ON bilhetes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all lancamentos" ON lancamentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all resultados" ON resultados FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all config" ON config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all admin_credenciais" ON admin_credenciais FOR ALL USING (true) WITH CHECK (true);
