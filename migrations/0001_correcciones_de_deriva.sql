-- 0001 — Correcciones de deriva detectadas el 2026-07-16.
-- Alinea bases creadas con versiones anteriores del esquema con database.sql.
-- Idempotente: sobre una base ya alineada no cambia nada.

-- nodos_fabric: la restricción única que exige ON CONFLICT (nombre).
CREATE UNIQUE INDEX IF NOT EXISTS nodos_fabric_nombre_key
  ON nodos_fabric (nombre);

-- candidatos: columna del logo del frente.
ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS logo_frente TEXT;

-- elecciones: la regla de fechas también vive en la base, no solo en la API.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_fechas_eleccion'
      AND conrelid = 'elecciones'::regclass
  ) THEN
    ALTER TABLE elecciones
      ADD CONSTRAINT chk_fechas_eleccion CHECK (fecha_fin > fecha_inicio);
  END IF;
END $$;

-- usuario_canales: el timestamp lleva zona horaria, como el resto del esquema.
ALTER TABLE usuario_canales
  ALTER COLUMN creado_en TYPE timestamptz;
