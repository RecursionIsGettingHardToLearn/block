import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      // Debe ir al final: apaga las reglas de estilo que chocan con Prettier
      // y reporta las diferencias de formato como errores de ESLint.
      eslintPluginPrettierRecommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // El tipado es parte del estándar: `any` desactiva el chequeo de tipos.
      '@typescript-eslint/no-explicit-any': 'error',

      // Deuda técnica conocida y medida (ver ESTANDARES_CODIFICACION.md §8).
      // Se dispara en el patrón «cargar datos al montar la página», usado en 9
      // sitios. Eliminarlo exige mover la carga de datos a una capa dedicada
      // (React Query o loaders del router): es un cambio de arquitectura, no de
      // estilo. Se deja como aviso —visible en cada `npm run lint`— en lugar de
      // desactivarlo, para que la deuda no se pierda de vista.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
