-- Migração: adicionar coluna contas_socio (C/S - Contas/Sócio) na tabela gerentes
-- Execute no SQL Editor do Supabase

ALTER TABLE gerentes ADD COLUMN IF NOT EXISTS contas_socio TEXT;
