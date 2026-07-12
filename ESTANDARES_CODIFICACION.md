# Estándares de Codificación — Block (Voto Electrónico FICCT)

**Proyecto:** Block — plataforma de voto electrónico sobre blockchain (NestJS · React + Vite · Hyperledger Fabric)
**Rama de trabajo:** `main`
**Autor:** RecursionIsGettingHardToLearn

Este documento define los estándares de codificación del proyecto y cómo **verificarlos con herramientas**. Los estándares se derivaron del código real del repositorio y se midieron sobre él (ver §9 Cumplimiento): no son reglas en papel, son las convenciones que el código cumple hoy y que todo aporte nuevo debe mantener.

---

## 1. Objetivo y alcance

Garantizar que todo el código sea **legible, consistente y mantenible**, sin importar quién lo escriba ni en qué módulo. El proyecto es **TypeScript de punta a punta**, así que la verificación es homogénea en las tres capas.

| Módulo | Tecnología | Estándar base | Herramienta de verificación |
|---|---|---|---|
| `backend/` | TypeScript · NestJS 11 · PostgreSQL | typescript-eslint (`recommendedTypeChecked`) | ESLint (`backend/eslint.config.mjs`) + `tsc` |
| `frontend/` | TypeScript · React 19 · Vite | typescript-eslint + react-hooks | ESLint (`frontend/eslint.config.js`) + `tsc -b` |
| `chaincode/` | TypeScript · Hyperledger Fabric | typescript-eslint (`recommendedTypeChecked`) | ESLint (`chaincode/eslint.config.mjs`) + `tsc` |
| Scripts raíz (`*.ts`) | TypeScript · ts-node | Prettier | `prettier --check` |

Verificación completa del repositorio, con un solo comando:

```bash
npm run verify      # lint + typecheck de los tres módulos (hoy: pasa)
```

---

## 2. Estándares generales (todo el repositorio)

Definidos en **`.editorconfig`** (raíz), que cualquier editor moderno respeta automáticamente, y en **`.prettierrc`** (raíz), que es la **única fuente de verdad del formato** para los tres módulos.

- Codificación **UTF-8** y saltos de línea **LF**; todo archivo termina con salto de línea final y sin espacios al final de línea.
- Indentación con **espacios**: 2 en TS/TSX/JS/CSS/JSON/YAML, 4 en Python.
- **Comillas simples** y **coma final** (`trailingComma: all`): definido en `.prettierrc`, aplicado por Prettier, no negociado archivo por archivo.
- Ancho de línea objetivo **80 caracteres** (`printWidth`). Es un objetivo, no un límite duro: Prettier no parte literales de texto (sentencias SQL, comandos `docker`, clases de Tailwind), y esas líneas pueden excederlo legítimamente.
- Idioma: los **identificadores en inglés** cuando expresan mecánica (`getErrorMessage`, `parseAsset`) y los **términos del dominio en español**, tal como están en la base de datos y en la interfaz (`eleccion`, `candidato`, `nodo`, `canal`, `recibo_voto`). Los **comentarios, mensajes al usuario y commits se escriben en español**.
- **Prohibido** subir credenciales o tokens al código: todo secreto vive en variables de entorno (`JWT_SECRET`, `DB_PASSWORD`, `FABRIC_CA_URL`), leídas con `ConfigService.getOrThrow()`, que falla al arrancar si falta el valor en lugar de arrancar con uno vacío.

---

## 3. Tipado — la regla transversal del proyecto

Es el estándar más importante y se aplica a los tres módulos por igual.

> **`any` está prohibido.** No es un tipo: es un interruptor que apaga el chequeo de tipos.

La razón no es teórica. En este repositorio, `@types/pg` no estaba instalado y `tsconfig.json` tenía `"noImplicitAny": false`, lo que **silenciaba** el error: `Pool`, `QueryResult` y toda la capa de acceso a datos eran en realidad `any` disfrazado, sin que el compilador dijera nada. Eso, por sí solo, generaba 336 de los 635 problemas que reportaba ESLint. La regla se hace cumplir con dos guardas complementarias:

| Guarda | Dónde | Qué impide |
|---|---|---|
| `"noImplicitAny": true` | `backend/tsconfig.json` | Que un `any` entre **sin querer**, por una dependencia sin tipos |
| `@typescript-eslint/no-explicit-any: 'error'` | los tres `eslint.config.*` | Que un `any` se escriba **a propósito** |

### 3.1 Patrones sustitutos (los que usa el código hoy)

| En lugar de… | Se usa… | Dónde vive |
|---|---|---|
| `catch (err: any)` + `err.message` | `catch (err: unknown)` + `getErrorMessage(err)` | `backend/src/common/errors.ts` |
| `catch (e: any)` + `e?.response?.data?.message` | `catch (e: unknown)` + `getApiErrorMessage(e, fallback)` | `frontend/src/api/errors.ts` |
| `db.query<any>(...)` | `db.query<FabricNodeRow>(...)` con una interfaz por consulta | junto a cada servicio |
| `JSON.parse(bytes.toString())` | `parseAsset<ElectionState>(bytes)` | `chaincode/src/voting.contract.ts` |
| `(form as any)[key]` | arreglo de campos `as const` → la clave se infiere sola | páginas de admin |

```ts
// ✔ Correcto: el error se estrecha una sola vez, de forma segura
try {
  await http.get('/api/v1/cainfo');
} catch (err: unknown) {
  this.logger.error(`CA info failed: ${getErrorMessage(err)}`);
}

// ✘ Incorrecto: `any` desactiva el chequeo en todo el bloque
try {
  await http.get('/api/v1/cainfo');
} catch (err: any) {
  this.logger.error(`CA info failed: ${err.message}`);
}
```

---

## 4. Backend — TypeScript / NestJS

### 4.1 Convenciones de nombres (con ejemplos reales del repo)

| Elemento | Convención | Ejemplo real |
|---|---|---|
| Archivos | `nombre.rol.ts` en `kebab-case` | `elections.service.ts`, `roles.guard.ts`, `jwt.strategy.ts` |
| DTOs | `verbo-sustantivo.dto.ts` | `create-election.dto.ts`, `create-candidate.dto.ts` |
| Clases | `PascalCase` con el rol como sufijo | `ElectionsService`, `RolesGuard`, `DatabaseService` |
| Métodos y variables | `camelCase` | `closeExpiredElections()`, `validateUser()` |
| Constantes de módulo | `UPPER_SNAKE_CASE` | `CA_URL`, `CHANNEL_NAME`, `CRYPTO_BASE`, `MSP_ID` |
| Métodos privados | modificador `private` | `private buildAuthToken()`, `private map()` |
| Filas de base de datos | `XxxRow`, campos en `snake_case` | `FabricNodeRow`, `CandidateTallyRow` |

La distinción `FabricNode` / `FabricNodeRow` es deliberada: **`Row` es lo que devuelve Postgres** (`host_alias`, `creado_en`) y el modelo del dominio es lo que consume la aplicación (`hostAlias`, `creadoEn`). El método `private map(r: FabricNodeRow): FabricNode` es la frontera entre ambos.

### 4.2 Reglas de código

- Un módulo Nest por dominio (`auth/`, `elections/`, `fabric/`, `nodes/`, `channels/`, `ca/`, `users/`, `audit/`), cada uno con su `*.module.ts`.
- La lógica de negocio vive en los `*.service.ts`; los `*.controller.ts` orquestan y responden.
- Toda entrada externa se valida con DTOs y `class-validator`; `ValidationPipe` corre con `whitelist: true` y `forbidNonWhitelisted: true`, así que un campo no declarado en el DTO es rechazado.
- Las promesas no se dejan sueltas (`no-floating-promises`): o se esperan con `await`, o se descartan explícitamente con `void`.
- Los errores capturados son `unknown`, nunca `any` (§3).

### 4.3 Cómo verificar

```bash
cd backend
npm run lint          # ESLint con información de tipos — BLOQUEANTE (hoy: 0)
npm run typecheck     # tsc --noEmit                    — BLOQUEANTE (hoy: 0)
npm test              # Jest                            (hoy: 12/12 pasan)
npm run format:check  # Prettier
```

---

## 5. Frontend — React + TypeScript (Vite)

### 5.1 Convenciones de nombres (con ejemplos reales del repo)

| Elemento | Convención | Ejemplo real |
|---|---|---|
| Componentes y páginas | `PascalCase.tsx` | `ElectionManager.tsx`, `VotingPage.tsx`, `LiveResults.tsx` |
| Hooks | `useX.ts` en camelCase | `useAuth.ts`, `useElections.ts` |
| Estado global (Zustand) | `dominio.store.ts` | `auth.store.ts` |
| Capa HTTP | `src/api/` | `axios.config.ts`, `errors.ts` |
| Tipos del dominio | `PascalCase` en `src/types/` | `Election`, `FabricNode`, `VoteReceipt` |
| Variables y funciones | `camelCase` | `fetchAllTallies()`, `isLoading` |

### 5.2 Estructura de `frontend/src/`

```
src/
├── api/         → cliente axios, interceptores y traducción de errores HTTP
├── components/  → componentes reutilizables
├── pages/       → páginas, agrupadas por rol: admin/ · voter/ · public/
├── hooks/       → lógica reutilizable con estado (useAuth, useElections)
├── store/       → estado global (Zustand)
├── routes/      → rutas y guardas por rol
├── types/       → tipos del dominio
└── assets/      → estáticos
```

### 5.3 Reglas de código

- **Prohibido `var`** (hoy: 0 usos); usar `const` / `let`.
- **Prohibido `any`** (hoy: 0 usos); los errores de red se traducen con `getApiErrorMessage()`.
- Las llamadas al backend pasan **siempre** por el cliente de `src/api/`, que adjunta el token JWT y cierra la sesión ante un 401. Los componentes no construyen peticiones a mano.
- **Nada impuro durante el render.** `useState(Date.now())` ejecuta la lectura del reloj en cada render; lo correcto es el inicializador perezoso `useState(() => Date.now())`, que corre una sola vez.
- Los valores derivados que alimentan un efecto se memorizan con `useMemo`, y las funciones con `useCallback`. Así el efecto puede depender del valor completo en vez de un sustituto frágil como `[lista.length]`.

```tsx
// ✔ Correcto: la referencia es estable, el efecto declara su dependencia real
const activeElections = useMemo(
  () => elections.filter((e) => e.status === 'ACTIVA'),
  [elections],
);
useEffect(() => { void fetchAllTallies(); }, [fetchAllTallies]);

// ✘ Incorrecto: depender de `.length` para esquivar un bucle de renders
useEffect(() => { fetchAllTallies(); }, [activeElections.length]);
```

### 5.4 Cómo verificar

```bash
cd frontend
npm run lint          # ESLint — BLOQUEANTE (hoy: 0 errores)
npm run typecheck     # tsc -b --noEmit (hoy: 0)
npm run build         # el build falla si hay errores de tipos
```

---

## 6. Chaincode — TypeScript / Hyperledger Fabric

El chaincode **decide el resultado de una elección**: es el módulo con el listón más alto y, hasta ahora, era el único sin linter. Ya lo tiene, con las mismas reglas que el backend.

| Elemento | Convención | Ejemplo real |
|---|---|---|
| Contrato | `dominio.contract.ts` → clase `PascalCase` | `voting.contract.ts` → `VotingContract` |
| Modelos del ledger | `nombre.model.ts` en `kebab-case` | `election-state.model.ts`, `tally.model.ts`, `vote.model.ts` |
| Transacciones | método `async` decorado con `@Transaction()` | `initEleccion()`, `emitirVoto()`, `cerrarEleccion()` |
| Claves de estado | helper por tipo de asset | `voteKey()`, `tallyKey()`, `electionKey()` |

- Todo dato leído del ledger se deserializa con `parseAsset<T>()`. `JSON.parse` devuelve `any`, y asignarlo a una variable tipada anula el chequeo sin avisar; el helper concentra esa conversión en **un solo lugar, explícito y auditable**.
- Toda transacción valida el estado antes de escribir (una elección `CERRADA` no acepta votos; un voto ya emitido no se sobrescribe).

```bash
cd chaincode
npm run lint       # BLOQUEANTE (hoy: 0)
npm run typecheck  # BLOQUEANTE (hoy: 0)
```

---

## 7. Convenciones de Git

- **Ramas:** una rama por integrante o tarea, que se integra a `main`.
- **Commits:** **Conventional Commits en español**, con scope:
  - `feat(elections): cierre automatico de elecciones vencidas`
  - `fix(fabric): reintentar el envio del voto si el peer no responde`
  - `refactor(backend): tipar la capa de acceso a datos`
  - `style(frontend): aplicar formato de Prettier`
  - `docs: estandares de codificacion`
- Tipos permitidos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
- El título describe **qué** cambia; el cuerpo, **por qué**, cuando no es evidente.
- **Cada commit se firma con la identidad real de quien lo escribe** (`user.name` y `user.email` configurados). El historial de este repositorio contiene commits atribuidos a `Tu Nombre <tuemail@example.com>`: eso es un git mal configurado, no un autor. Antes de commitear:

```bash
git config user.name  "TuUsuarioDeGitHub"
git config user.email "tu-correo@ejemplo.com"
```

---

## 8. Código generado y dependencias

`node_modules/`, `dist/`, `build/`, `coverage/`, `package-lock.json` y el material criptográfico de Fabric (`fabric/network/crypto-material/`) son **código generado o dependencias**: no se editan a mano ni se les exige estilo. Están excluidos en `.prettierignore` y en los `ignores` de cada configuración de ESLint.

---

## 9. Cumplimiento — evidencia medida sobre el repositorio

Verificaciones ejecutadas sobre `main`, con las herramientas de cada módulo (98 archivos TypeScript: 49 backend, 29 frontend, 5 chaincode, 15 scripts).

### 9.1 Estado

| Verificación | Comando | Antes | Ahora |
|---|---|---|---|
| ESLint backend | `npm run lint --prefix backend` | 635 problemas | **0** |
| ESLint frontend | `npm run lint --prefix frontend` | 37 problemas | **0 errores** (9 avisos, §9.2) |
| ESLint chaincode | `npm run lint --prefix chaincode` | *sin linter* | **0** |
| Tipos backend | `tsc --noEmit` (con `noImplicitAny`) | *`any` silenciado* | **0 errores** |
| Tipos frontend | `tsc -b --noEmit` | 0 | **0** |
| Tipos chaincode | `tsc --noEmit` | 0 | **0** |
| Tests backend | `npm test --prefix backend` | 12/12 | **12/12** |
| Build frontend | `npm run build --prefix frontend` | OK | **OK** |
| Formato (3 módulos) | `prettier --check` | *sin config unificada* | **todo conforme** |
| `any` en el código | búsqueda en `src/` | 43 | **0** |
| `var` en el código | búsqueda en `src/` | 0 | **0** |

Las líneas que superan los 80 caracteres son, en su totalidad, literales que Prettier no puede partir (sentencias SQL, comandos `docker`, cadenas de clases de Tailwind). `prettier --check` las da por conformes; no son incumplimientos.

### 9.2 Deuda técnica conocida (no bloqueante)

**9 avisos de `react-hooks/set-state-in-effect`** — uno por cada página o hook que carga sus datos al montarse (`useElections`, `AdminResults`, `AuditLogs`, `CAPage`, `ChannelsPage`, `ElectionManager` ×2, `NodesPage`, `LiveResults`).

La regla advierte que actualizar estado desde un efecto encadena renders. Resolverlo de verdad exige **mover la carga de datos a una capa dedicada** (React Query, SWR o loaders del router), lo cual es un cambio de arquitectura, no de estilo, y se documenta aquí en lugar de acometerlo junto con el formato.

La regla se dejó como **aviso, no desactivada**: aparece en cada `npm run lint`, de modo que la deuda queda a la vista y contabilizada en vez de escondida bajo un `// eslint-disable`.

---

## 10. Mantenimiento

**Antes de cada commit**, ejecutar la verificación del módulo tocado (§4.3, §5.4, §6) o, directamente, la del repositorio completo:

```bash
npm run verify     # lint + typecheck de backend, frontend y chaincode
npm run format     # aplica Prettier a los tres módulos y a los scripts raíz
```

Un aporte se considera conforme cuando `npm run verify` termina en verde.
