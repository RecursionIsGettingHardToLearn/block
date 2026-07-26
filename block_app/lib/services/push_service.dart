import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'api_client.dart';

/// Notificaciones push (Firebase Cloud Messaging).
///
/// Se encarga de inicializar Firebase, pedir permiso, obtener el token del
/// dispositivo y registrarlo en el backend tras el login.
///
/// Degradación segura: si Firebase todavía no está configurado en el proyecto
/// (falta google-services.json o la configuración de FlutterFire), la
/// inicialización falla en silencio y la app sigue funcionando sin push.
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  bool _iniciado = false;

  Future<void> _asegurarInicio() async {
    if (_iniciado) return;
    try {
      await Firebase.initializeApp();
      await FirebaseMessaging.instance.requestPermission();

      // Mensajes con la app en primer plano: aquí puedes mostrar un aviso en la
      // interfaz (por ejemplo con flutter_local_notifications). Con la app en
      // segundo plano o cerrada, el sistema muestra la notificación solo.
      FirebaseMessaging.onMessage.listen((mensaje) {
        final n = mensaje.notification;
        if (n != null) {
          // ignore: avoid_print
          print('Push recibido: ${n.title} — ${n.body}');
        }
      });

      _iniciado = true;
    } catch (_) {
      // Firebase no configurado aún → sin push, la app sigue igual.
    }
  }

  /// Registra el token del dispositivo en el backend. Llamar tras un login
  /// exitoso (el endpoint requiere sesión). Nunca lanza.
  Future<void> registrarDispositivo() async {
    try {
      await _asegurarInicio();
      if (!_iniciado) return;
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      await ApiClient.instance.post('/dispositivos', {
        'token': token,
        'plataforma': Platform.isIOS ? 'ios' : 'android',
      });
    } catch (_) {
      // Silencioso: el push es un extra y no debe afectar el login.
    }
  }
}
