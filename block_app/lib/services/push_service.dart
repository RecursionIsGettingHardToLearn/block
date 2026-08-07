import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_client.dart';

/// Canal de notificaciones Android. El canal debe existir antes de mostrar
/// cualquier notificación local en Android 8+.
const AndroidNotificationChannel _canal = AndroidNotificationChannel(
  'evoting_push',                    // id del canal
  'E-Voting Notificaciones',         // nombre visible en ajustes del teléfono
  description: 'Avisos de votación y blockchain.',
  importance: Importance.high,       // aparece como banner emergente
);

final FlutterLocalNotificationsPlugin _localNotif =
    FlutterLocalNotificationsPlugin();

/// Notificaciones push (Firebase Cloud Messaging).
///
/// Tres escenarios:
///   - App en PRIMER PLANO  → FCM entrega el mensaje pero NO muestra nada
///     visible. Este servicio lo intercepta con onMessage y lo muestra via
///     flutter_local_notifications (banner emergente).
///   - App en SEGUNDO PLANO → el sistema Android/iOS muestra la notificación
///     solo, sin código extra.
///   - App CERRADA           → igual que segundo plano.
///
/// Degradación segura: si Firebase no está configurado (falta
/// firebase_options.dart o google-services.json), la inicialización falla en
/// silencio y la app sigue funcionando sin push.
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  bool _iniciado = false;

  Future<void> _asegurarInicio() async {
    if (_iniciado) return;
    try {
      await Firebase.initializeApp();

      // ── Permisos ──────────────────────────────────────────────────────────
      await FirebaseMessaging.instance.requestPermission();

      // En Android, FCM no muestra el banner cuando la app está abierta.
      // Le decimos explícitamente que queremos mostrar heads-up, badges y
      // sonido — esto solo afecta el comportamiento en primer plano.
      await FirebaseMessaging.instance
          .setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );

      // ── Canal Android (obligatorio en Android 8+) ─────────────────────────
      await _localNotif
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(_canal);

      // ── Inicializar flutter_local_notifications ───────────────────────────
      const initAndroid =
          AndroidInitializationSettings('@mipmap/ic_launcher');
      const initIos = DarwinInitializationSettings();
      await _localNotif.initialize(
        const InitializationSettings(android: initAndroid, iOS: initIos),
      );

      // ── Escuchar mensajes en primer plano ─────────────────────────────────
      FirebaseMessaging.onMessage.listen((RemoteMessage mensaje) {
        final n = mensaje.notification;
        if (n == null) return;

        // Mostrar la notificación como banner emergente usando el canal creado.
        _localNotif.show(
          n.hashCode,
          n.title,
          n.body,
          NotificationDetails(
            android: AndroidNotificationDetails(
              _canal.id,
              _canal.name,
              channelDescription: _canal.description,
              importance: Importance.high,
              priority: Priority.high,
              icon: '@mipmap/ic_launcher',
            ),
            iOS: const DarwinNotificationDetails(),
          ),
        );
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
