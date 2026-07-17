-- 0002 — Columnas del flujo de votación que el código siempre usó pero que
-- nunca se escribieron en database.sql: existían solo en la base antigua,
-- agregadas a mano desde pgAdmin (la deriva inversa a la de 0001).
--
-- id_candidato: candidato elegido (NULL en votos blancos y nulos).
-- tipo_voto_especial: 'votos_blancos' | 'votos_nulos' (NULL en votos normales).

ALTER TABLE recibos_voto
  ADD COLUMN IF NOT EXISTS id_candidato UUID;

ALTER TABLE recibos_voto
  ADD COLUMN IF NOT EXISTS tipo_voto_especial VARCHAR(20);
