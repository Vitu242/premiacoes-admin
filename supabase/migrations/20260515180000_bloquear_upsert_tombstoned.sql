-- Migração: bloqueia no banco qualquer INSERT/UPDATE de IDs marcados como
-- "tombstoneados" em config[id='tombstones'].value[<tabela>].
--
-- POR QUE: o app web já filtra IDs tombstoneados no push, mas se algum
-- navegador estiver com bundle antigo em cache ele pode upsertar a lista
-- inteira (incluindo IDs já apagados) e ressuscitar registros. Esta
-- defesa roda DENTRO do Postgres, então nenhum bundle de navegador
-- consegue contornar.
--
-- COMO APLICAR: cole este arquivo no SQL Editor do Supabase e execute
-- uma única vez.

CREATE OR REPLACE FUNCTION reject_tombstoned() RETURNS TRIGGER AS $$
DECLARE
  v_tomb JSONB;
  v_table TEXT := TG_TABLE_NAME;
  v_id TEXT := NEW.id::text;
BEGIN
  SELECT value INTO v_tomb FROM config WHERE id = 'tombstones';
  IF v_tomb IS NULL THEN
    RETURN NEW;
  END IF;
  IF (v_tomb -> v_table -> v_id) IS NOT NULL THEN
    -- Ignora silenciosamente — o cliente segue feliz, o banco protegido.
    RAISE NOTICE 'reject_tombstoned: bloqueado % id=% (consta em tombstones)', v_table, v_id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reject_tombstoned_cambistas ON cambistas;
CREATE TRIGGER reject_tombstoned_cambistas
  BEFORE INSERT OR UPDATE ON cambistas
  FOR EACH ROW EXECUTE FUNCTION reject_tombstoned();

DROP TRIGGER IF EXISTS reject_tombstoned_gerentes ON gerentes;
CREATE TRIGGER reject_tombstoned_gerentes
  BEFORE INSERT OR UPDATE ON gerentes
  FOR EACH ROW EXECUTE FUNCTION reject_tombstoned();

DROP TRIGGER IF EXISTS reject_tombstoned_lancamentos ON lancamentos;
CREATE TRIGGER reject_tombstoned_lancamentos
  BEFORE INSERT OR UPDATE ON lancamentos
  FOR EACH ROW EXECUTE FUNCTION reject_tombstoned();

DROP TRIGGER IF EXISTS reject_tombstoned_bilhetes ON bilhetes;
CREATE TRIGGER reject_tombstoned_bilhetes
  BEFORE INSERT OR UPDATE ON bilhetes
  FOR EACH ROW EXECUTE FUNCTION reject_tombstoned();

DROP TRIGGER IF EXISTS reject_tombstoned_resultados ON resultados;
CREATE TRIGGER reject_tombstoned_resultados
  BEFORE INSERT OR UPDATE ON resultados
  FOR EACH ROW EXECUTE FUNCTION reject_tombstoned();

DROP TRIGGER IF EXISTS reject_tombstoned_extracoes ON extracoes;
CREATE TRIGGER reject_tombstoned_extracoes
  BEFORE INSERT OR UPDATE ON extracoes
  FOR EACH ROW EXECUTE FUNCTION reject_tombstoned();
