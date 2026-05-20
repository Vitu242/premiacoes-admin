-- ============================================================
-- PATCH: relaxar chaves estrangeiras para sincronização offline
-- ============================================================
--
-- Motivo:
-- O app trabalha offline-first: alterações ficam no localStorage e são
-- empurradas depois para o Supabase. Em bancos reativados/antigos, alguns
-- cambistas podem chegar com gerente_id que ainda não existe no Supabase.
-- A FK bloqueia o upsert inteiro e a fila nunca zera.
--
-- Solução:
-- Remover FKs frágeis entre entidades sincronizadas por fila, mantendo índices
-- para consulta. A integridade lógica continua sendo controlada pelo app.

ALTER TABLE cambistas
  DROP CONSTRAINT IF EXISTS cambistas_gerente_id_fkey;

ALTER TABLE bilhetes
  DROP CONSTRAINT IF EXISTS bilhetes_cambista_id_fkey;

ALTER TABLE lancamentos
  DROP CONSTRAINT IF EXISTS lancamentos_cambista_id_fkey;

CREATE INDEX IF NOT EXISTS idx_cambistas_gerente_id ON cambistas (gerente_id);
CREATE INDEX IF NOT EXISTS idx_bilhetes_cambista_id ON bilhetes (cambista_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_cambista_id ON lancamentos (cambista_id);

-- Conferência: deve retornar zero linhas para as constraints removidas.
SELECT conname
FROM pg_constraint
WHERE conname IN (
  'cambistas_gerente_id_fkey',
  'bilhetes_cambista_id_fkey',
  'lancamentos_cambista_id_fkey'
);
