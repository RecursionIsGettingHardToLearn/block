import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import 'session_service.dart';

/// Error de API con mensaje legible, para mostrarlo al usuario.
class ApiException implements Exception {
  final String mensaje;
  final int? status;
  ApiException(this.mensaje, {this.status});
  @override
  String toString() => mensaje;
}

/// Cliente HTTP del backend. Adjunta el token JWT automáticamente y traduce
/// los errores del backend a [ApiException] con el mensaje real.
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  Map<String, String> _headers({bool json = true}) {
    final h = <String, String>{};
    if (json) h['Content-Type'] = 'application/json';
    final token = SessionService.instance.token;
    if (token != null) h['Authorization'] = 'Bearer $token';
    return h;
  }

  Uri _uri(String path) => Uri.parse('${ApiConfig.baseUrl}$path');

  /// Extrae el mensaje de error del cuerpo del backend (que suele venir como
  /// { message: string | string[] }).
  String _mensajeError(http.Response res) {
    try {
      final body = jsonDecode(res.body);
      final msg = body is Map ? body['message'] : null;
      if (msg is List && msg.isNotEmpty) return msg.first.toString();
      if (msg is String) return msg;
    } catch (_) {}
    return 'Error ${res.statusCode}';
  }

  dynamic _procesar(http.Response res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (res.body.isEmpty) return null;
      return jsonDecode(res.body);
    }
    throw ApiException(_mensajeError(res), status: res.statusCode);
  }

  Future<dynamic> get(String path) async {
    final res = await http.get(_uri(path), headers: _headers());
    return _procesar(res);
  }

  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    final res = await http.post(
      _uri(path),
      headers: _headers(),
      body: body == null ? null : jsonEncode(body),
    );
    return _procesar(res);
  }
}
