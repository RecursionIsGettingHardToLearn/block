import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../theme.dart';

/// Resultados para el administrador. Lista las elecciones y, al tocar una,
/// muestra el desglose por candidato (el admin lo ve incluso durante una
/// elección activa, vía el endpoint /admin).
class AdminResultsScreen extends StatefulWidget {
  const AdminResultsScreen({super.key});

  @override
  State<AdminResultsScreen> createState() => _AdminResultsScreenState();
}

class _AdminResultsScreenState extends State<AdminResultsScreen> {
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

  void _verResultados(String id, String titulo) {
    showDialog(
      context: context,
      builder: (_) => _DialogoResultados(electionId: id, titulo: titulo),
    );
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
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: const BorderSide(color: Color(0xFFE2E8F0)),
            ),
            child: ListTile(
              leading: const Icon(Icons.bar_chart, color: AppColors.marca),
              title: Text(
                (e['title'] ?? '') as String,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text((e['status'] ?? '') as String),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _verResultados(
                  e['id'] as String, (e['title'] ?? '') as String),
            ),
          );
        },
      ),
    );
  }
}

/// Diálogo con el desglose de resultados de una elección (endpoint admin).
class _DialogoResultados extends StatefulWidget {
  final String electionId;
  final String titulo;
  const _DialogoResultados({required this.electionId, required this.titulo});

  @override
  State<_DialogoResultados> createState() => _DialogoResultadosState();
}

class _DialogoResultadosState extends State<_DialogoResultados> {
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
          .get('/fabric/results/${widget.electionId}/admin');
      setState(() => _data = data as Map<String, dynamic>);
    } on ApiException catch (e) {
      setState(() => _error = e.mensaje);
    } catch (_) {
      setState(() => _error = 'No se pudieron cargar los resultados.');
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
    final results = (d['results'] ?? {}) as Map<String, dynamic>;
    if (results.isEmpty) {
      return const Text('Aún no hay votos registrados en esta elección.');
    }
    // Total para porcentajes.
    final total = results.values
        .fold<int>(0, (a, b) => a + ((b as num).toInt()));

    final entradas = results.entries.toList()
      ..sort((a, b) => (b.value as num).compareTo(a.value as num));

    return SizedBox(
      width: double.maxFinite,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final e in entradas)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          e.key,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Text(
                        '${e.value}',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: AppColors.marca,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: total > 0 ? (e.value as num) / total : 0,
                      minHeight: 6,
                      backgroundColor: const Color(0xFFE2E8F0),
                      valueColor: const AlwaysStoppedAnimation<Color>(
                          AppColors.marca),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
