# Migraciones

Cambios incrementales del esquema. `npm run db:migrate` aplica las pendientes
en orden, sin tocar los datos; `schema_migrations` registra cuáles ya corrieron.

Convención: `NNNN_descripcion.sql` (número secuencial). Una migración aplicada
**nunca se edita**: los ajustes van en una nueva. Todo cambio de esquema se
escribe dos veces: como migración (para las bases vivas) y en `database.sql`
(para las bases desde cero). Después de cada `git pull`: `npm run db:migrate`.
