-- Migração: adicionar coluna tipo (Cambista/Cliente) na tabela cambistas
-- Execute no SQL Editor do Supabase ou via: supabase db push

ALTER TABLE cambistas ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'cambista';

-- Garante que registros existentes tenham tipo válido
UPDATE cambistas SET tipo = 'cambista' WHERE tipo IS NULL;
