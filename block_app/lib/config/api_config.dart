/// Configuración de la conexión al backend.
///
/// IMPORTANTE — la URL cambia según dónde corras la app:
/// - Emulador Android: usa 10.0.2.2 (alias del localhost de tu PC desde el
///   emulador). El http://localhost NO funciona en el emulador porque apunta
///   al propio teléfono, no a tu computadora.
/// - Dispositivo físico en la misma red: usa la IP local de tu PC
///   (p. ej. http://192.168.1.20:3000).
/// - Producción (Azure): usa la URL pública con https.
///
/// Ajusta [baseUrl] a tu caso antes de compilar.
class ApiConfig {
  // Producción (Azure): Caddy sirve la API bajo /api/* y quita ese prefijo
  // antes de reenviar al backend NestJS (:3000). Por eso el sufijo /api aquí.
  static const String baseUrl =
      'https://block-evoting-22439.northcentralus.cloudapp.azure.com/api';

  // Para desarrollo local con el emulador de Android, usar en su lugar:
  //   static const String baseUrl = 'http://10.0.2.2:3000';
}
