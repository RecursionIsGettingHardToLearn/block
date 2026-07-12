import { isAxiosError } from 'axios';

/**
 * Cuerpo de error que devuelve el backend NestJS.
 * `message` llega como texto en las excepciones normales y como arreglo cuando
 * el error viene del ValidationPipe (una entrada por campo inválido).
 */
interface ApiErrorBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

/**
 * Obtiene un mensaje presentable a partir de cualquier error capturado.
 *
 * Reemplaza el patrón `catch (e: any)` + `e?.response?.data?.message`, que
 * desactivaba el chequeo de tipos en cada pantalla. Aquí el estrechamiento se
 * hace una sola vez y de forma segura.
 *
 * @param err      Valor capturado en el `catch` (tipo `unknown`).
 * @param fallback Mensaje a mostrar si el error no trae uno propio.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError<ApiErrorBody>(err)) {
    const { message } = err.response?.data ?? {};
    if (Array.isArray(message) && message.length > 0) {
      return message.join(', ');
    }
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
