import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/usuario.dart';

/// Guarda la sesión (token JWT + usuario) de forma persistente, para que la
/// app recuerde al usuario entre aperturas. Es un singleton simple.
class SessionService {
  SessionService._();
  static final SessionService instance = SessionService._();

  static const _kToken = 'token';
  static const _kUser = 'user';

  String? _token;
  Usuario? _usuario;

  String? get token => _token;
  Usuario? get usuario => _usuario;
  bool get autenticado => _token != null && _usuario != null;

  /// Carga la sesión guardada al arrancar la app.
  Future<void> cargar() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_kToken);
    final userRaw = prefs.getString(_kUser);
    if (userRaw != null) {
      _usuario = Usuario.fromJson(jsonDecode(userRaw) as Map<String, dynamic>);
    }
  }

  /// Guarda la sesión tras un login exitoso.
  Future<void> guardar(String token, Map<String, dynamic> userJson) async {
    _token = token;
    _usuario = Usuario.fromJson(userJson);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kToken, token);
    await prefs.setString(_kUser, jsonEncode(userJson));
  }

  /// Cierra la sesión y borra lo guardado.
  Future<void> cerrar() async {
    _token = null;
    _usuario = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kToken);
    await prefs.remove(_kUser);
  }
}
