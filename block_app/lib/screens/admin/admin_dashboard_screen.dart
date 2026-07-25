import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../theme.dart';

/// Panel del administrador: resumen del estado de la red (usuarios, elecciones,
/// canales, nodos, votos), tomado de /reports/network.
class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  bool _cargando = true;
  String? _error;
  Map<String, dynamic>? _data;

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
      final data = await ApiClient.instance.get('/reports/network');
      setState(() => _data = data as Map<String, dynamic>);
    } on ApiException catch (e) {
      setState(() => _error = e.mensaje);
    } catch (_) {
      setState(() => _error = 'No se pudo cargar el panel.');
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: Text(_error!));
    final d = _data;
    if (d == null) return const SizedBox.shrink();

    final usuarios = d['usuarios'] as Map<String, dynamic>;
    final elecciones = d['elecciones'] as Map<String, dynamic>;
    final canales = (d['canales'] as List).length;
    final nodos = (d['nodos'] as List).length;
    final votos = d['votos'] as Map<String, dynamic>;

    return RefreshIndicator(
      onRefresh: _cargar,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.5,
            children: [
              _card('Usuarios', '${usuarios['total']}', Icons.people),
              _card('Elecciones', '${elecciones['total']}', Icons.how_to_vote),
              _card('Canales', '$canales', Icons.lan),
              _card('Nodos', '$nodos', Icons.dns),
              _card('Votos confirmados', '${votos['confirmados']}',
                  Icons.check_circle, color: AppColors.exito),
            ],
          ),
          const SizedBox(height: 20),
          _seccion('Usuarios por rol',
              (usuarios['porRol'] as Map<String, dynamic>)),
          const SizedBox(height: 16),
          _seccion('Elecciones por estado',
              (elecciones['porEstado'] as Map<String, dynamic>)),
        ],
      ),
    );
  }

  Widget _card(String label, String valor, IconData icono,
      {Color color = AppColors.marca}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Icon(icono, color: color, size: 22),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                valor,
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
          ),
        ],
      ),
    );
  }

  Widget _seccion(String titulo, Map<String, dynamic> datos) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            titulo,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              color: AppColors.texto1,
            ),
          ),
          const SizedBox(height: 12),
          ...datos.entries.map(
            (e) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    e.key,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.texto2,
                    ),
                  ),
                  Text(
                    '${e.value}',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.texto1,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
