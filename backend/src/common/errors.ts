import { isAxiosError } from 'axios';

/**
 * Utilidades para manejar errores capturados sin recurrir a `any`.
 *
 * En un `catch`, TypeScript tipa el error como `unknown` (comportamiento
 * correcto: cualquier valor puede ser lanzado). Estas funciones estrechan ese
 * `unknown` a algo utilizable de forma segura, en lugar de silenciar el
 * chequeo de tipos con `catch (err: any)`.
 */

/** Forma del cuerpo de error que devuelve la API REST de Fabric CA. */
interface CaErrorBody {
  errors?: { code?: number; message?: string }[];
}

/**
 * Extrae un mensaje legible de cualquier valor lanzado.
 * Nunca lanza: si el valor no es un Error, lo convierte a texto.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return JSON.stringify(err);
}

/**
 * Extrae el mensaje de error que reporta la Fabric CA en el cuerpo de la
 * respuesta HTTP. Si no es un error de axios o no trae ese cuerpo, devuelve
 * `undefined` para que quien llame use su propio mensaje por defecto.
 */
export function getCaErrorMessage(err: unknown): string | undefined {
  if (!isAxiosError<CaErrorBody>(err)) {
    return undefined;
  }
  return err.response?.data?.errors?.[0]?.message;
}

/**
 * Error de `child_process.exec`: además del mensaje trae la salida de error
 * del comando, que suele ser lo único que explica por qué falló el CLI de
 * Fabric o de Docker.
 */
interface ExecError {
  stderr?: string;
}

function getStderr(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'stderr' in err) {
    const { stderr } = err as ExecError;
    return typeof stderr === 'string' ? stderr : '';
  }
  return '';
}

/**
 * Detalle completo del fallo de un comando: mensaje del error y `stderr`.
 * Pensado para el cuerpo de una excepción, donde interesa el contexto entero.
 */
export function getExecErrorDetail(err: unknown): string {
  return `${getErrorMessage(err)}\n${getStderr(err)}`.trim();
}

/**
 * Resumen de una línea del fallo de un comando, para registrar en el log sin
 * volcar toda la salida del proceso.
 */
export function getExecErrorSummary(err: unknown): string {
  const detail = getStderr(err) || getErrorMessage(err);
  return detail.split('\n')[0].trim();
}
