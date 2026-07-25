import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../theme.dart';

/// Lista de elecciones para el auditor, con su estado. Al tocar una, muestra su
/// participación (padrón, votaron, no votaron).
class AuditorElectionsScreen extends StatefulWidget {
  const AuditorElectionsScreen({super.key});

  @override
  State<AuditorElectionsScreen> createState() =>
      _AuditorElectionsScreenState();
}

class _AuditorElectionsScreenState extends State<AuditorElectionsScreen> {
  bool _cargando = true;
  String? _error;
  List<dynamic> _elecciones = [];

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final data = await ApiClient.instance.get('/elections');
      setState(() => _elecciones = data as List);
    } on ApiException catch (e) {
      setState(() => _error = e.mensaje);
    } catch (_) {
      setState(() => _error = 'No se pudieron cargar las elecciones.');
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  Future<void> _verParticipacion(String id, String titulo) async {
    showDialog(
      context: context,
      builder: (_) => _DialogoParticipacion(electionId: id, titulo: titulo),
    );
  }

  Color _colorEstado(String estado) {
    switch (estado) {
      case 'ACTIVA':
        return AppColors.exito;
      case 'PROGRAMADA':
        return AppColors.alerta;
      default:
        return AppColors.texto3;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: Text(_error!));
    if (_elecciones.isEmpty) {
      return const Center(child: Text('No hay elecciones.'));
    }

    return RefreshIndicator(
      onRefresh: _cargar,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _elecciones.length,
        itemBuilder: (_, i) {
          final e = _elecciones[i] as Map<String, dynamic>;
          final estado = (e['status'] ?? '') as String;
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: const BorderSide(color: Color(0xFFE2E8F0)),
            ),
            child: ListTile(
              title: Text(
                (e['title'] ?? '') as String,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text((e['channelName'] ?? '') as String),
              trailing: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _colorEstado(estado).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  estado,
                  style: TextStyle(
                    color: _colorEstado(estado),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              onTap: () =>
                  _verParticipacion(e['id'] as String, (e['title'] ?? '') as String),
            ),
          );
        },
      ),
    );
  }
}

/// Diálogo que carga y muestra la participación de una elección.
class _DialogoParticipacion extends StatefulWidget {
  final String electionId;
  final String titulo;
  const _DialogoParticipacion({
    required this.electionId,
    required this.titulo,
  });

  @override
  State<_DialogoParticipacion> createState() => _DialogoParticipacionState();
}

class _DialogoParticipacionState extends State<_DialogoParticipacion> {
  Map<String, dynamic>? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final data = await ApiClient.instance
          .get('/elections/${widget.electionId}/participation');
      setState(() => _data = data as Map<String, dynamic>);
    } on ApiException catch (e) {
      setState(() => _error = e.mensaje);
    } catch (_) {
      setState(() => _error = 'No se pudo cargar la participación.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.titulo),
      content: _error != null
          ? Text(_error!)
          : _data == null
              ? const SizedBox(
                  height: 80,
                  child: Center(child: CircularProgressIndicator()),
                )
              : _contenido(_data!),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cerrar'),
        ),
      ],
    );
  }

  Widget _contenido(Map<String, dynamic> d) {
    final total = (d['total'] ?? 0) as int;
    final votaron = (d['votaron'] ?? 0) as int;
    final noVotaron = (d['noVotaron'] ?? 0) as int;
    final pct = total > 0 ? (votaron / total * 100) : 0.0;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _stat('Padrón', total, AppColors.texto1),
            _stat('Votaron', votaron, AppColors.exito),
            _stat('Faltan', noVotaron, AppColors.alerta),
          ],
        ),
        const SizedBox(height: 16),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: total > 0 ? votaron / total : 0,
            minHeight: 8,
            backgroundColor: const Color(0xFFE2E8F0),
            valueColor:
                const AlwaysStoppedAnimation<Color>(AppColors.exito),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          '${pct.toStringAsFixed(1)}% de participación',
          style: const TextStyle(fontSize: 12, color: AppColors.texto3),
        ),
      ],
    );
  }

  Widget _stat(String label, int valor, Color color) {
    return Column(
      children: [
        Text(
          '$valor',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
        Text(
          label,
          style: const TextStyle(fontSize: 11, color: AppColors.texto3),
        ),
      ],
    );
  }
}
