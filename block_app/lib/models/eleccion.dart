/// Candidato de una elección.
class Candidato {
  final String id;
  final String frontName;
  final String candidateName;
  final String position;

  Candidato({
    required this.id,
    required this.frontName,
    required this.candidateName,
    required this.position,
  });

  factory Candidato.fromJson(Map<String, dynamic> json) {
    return Candidato(
      id: json['id'] as String,
      frontName: (json['frontName'] ?? '') as String,
      candidateName: (json['candidateName'] ?? '') as String,
      position: (json['position'] ?? '') as String,
    );
  }
}

/// Elección con sus candidatos.
class Eleccion {
  final String id;
  final String title;
  final String? description;
  final String status;
  final String channelName;
  final List<Candidato> candidatos;

  Eleccion({
    required this.id,
    required this.title,
    required this.description,
    required this.status,
    required this.channelName,
    required this.candidatos,
  });

  factory Eleccion.fromJson(Map<String, dynamic> json) {
    final cands = (json['candidates'] as List?) ?? [];
    return Eleccion(
      id: json['id'] as String,
      title: (json['title'] ?? '') as String,
      description: json['description'] as String?,
      status: (json['status'] ?? '') as String,
      channelName: (json['channelName'] ?? '') as String,
      candidatos: cands
          .map((c) => Candidato.fromJson(c as Map<String, dynamic>))
          .toList(),
    );
  }
}
