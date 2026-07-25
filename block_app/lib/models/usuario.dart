/// Rol del usuario. El backend usa los nombres nuevos; se normalizan aquí para
/// tolerar los antiguos (ADMIN/ESTUDIANTE/DOCENTE) por si algún dato viejo los
/// trae.
enum Rol { administrador, auditor, votante, desconocido }

Rol rolDesdeString(String? valor) {
  switch (valor) {
    case 'ADMINISTRADOR':
    case 'ADMIN':
      return Rol.administrador;
    case 'AUDITOR':
      return Rol.auditor;
    case 'VOTANTE':
    case 'ESTUDIANTE':
    case 'DOCENTE':
      return Rol.votante;
    default:
      return Rol.desconocido;
  }
}

/// Usuario autenticado, tal como lo devuelve el login del backend.
class Usuario {
  final String id;
  final String? ru;
  final String name;
  final Rol rol;
  final String? career;
  final bool hasVoted;

  Usuario({
    required this.id,
    required this.ru,
    required this.name,
    required this.rol,
    required this.career,
    required this.hasVoted,
  });

  factory Usuario.fromJson(Map<String, dynamic> json) {
    return Usuario(
      id: json['id'] as String,
      ru: json['ru'] as String?,
      name: (json['name'] ?? '') as String,
      rol: rolDesdeString(json['role'] as String?),
      career: json['career'] as String?,
      hasVoted: (json['hasVoted'] ?? false) as bool,
    );
  }
}
