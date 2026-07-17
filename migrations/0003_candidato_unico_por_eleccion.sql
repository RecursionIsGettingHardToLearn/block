-- 0003 — Una misma persona no puede postularse dos veces en la misma elección.
-- El candidato se identifica por su nombre (el modelo no tiene CI ni vínculo a
-- usuarios). Índice único sobre (elección, nombre normalizado): en minúsculas
-- y sin espacios sobrantes, para que 'Grover Choque' y ' grover  choque ' se
-- consideren la misma persona.
--
-- Si la base ya tuviera duplicados de antes, esta migración fallaria al crear
-- el índice; por eso primero se eliminan los repetidos, conservando el más
-- antiguo (menor creado_en) de cada grupo.
DELETE FROM candidatos c
USING candidatos d
WHERE c.id_eleccion = d.id_eleccion
  AND LOWER(regexp_replace(TRIM(c.nombre_candidato), '[[:space:]]+', ' ', 'g'))
    = LOWER(regexp_replace(TRIM(d.nombre_candidato), '[[:space:]]+', ' ', 'g'))
  AND c.creado_en > d.creado_en;

CREATE UNIQUE INDEX IF NOT EXISTS candidatos_persona_por_eleccion_key
  ON candidatos (id_eleccion, LOWER(regexp_replace(TRIM(nombre_candidato), '[[:space:]]+', ' ', 'g')));
