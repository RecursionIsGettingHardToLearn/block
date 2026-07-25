import 'package:flutter/material.dart';
import '../../models/eleccion.dart';
import '../../services/api_client.dart';
import '../../theme.dart';

/// Pantalla de votación. Lista las elecciones activas del votante (las de los
/// canales a los que está asignado) y permite emitir el voto, que el backend
/// blinda en la blockchain. Incluye voto en blanco y nulo.
class VoterVoteScreen extends StatefulWidget {
  const VoterVoteScreen({super.key});

  @override
  State<VoterVoteScreen> createState() => _VoterVoteScreenState();
}

class _VoterVoteScreenState extends State<VoterVoteScreen> {
  bool _cargando = true;
  String? _error;
  List<Eleccion> _elecciones = [];
  // Voto en curso por elección, para evitar dobles envíos.
  final Set<String> _enviando = {};
  // Elecciones ya votadas en esta sesión (para mostrar confirmación).
  final Map<String, String> _votadas = {}; // electionId -> txId

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
      final lista = (data as List)
          .map((e) => Eleccion.fromJson(e as Map<String, dynamic>))
          .toList();
      setState(() => _elecciones = lista);
    } on ApiException catch (e) {
      setState(() => _error = e.mensaje);
    } catch (_) {
      setState(() => _error = 'No se pudieron cargar las elecciones.');
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  Future<void> _votar(Eleccion eleccion, String candidateId) async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmar voto'),
        content: const Text(
          'Tu voto se registrará en la blockchain de forma definitiva y no se '
          'podrá cambiar. ¿Confirmas?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sí, confirmar'),
          ),
        ],
      ),
    );
    if (confirmado != true) return;

    setState(() => _enviando.add(eleccion.id));
    try {
      final data = await ApiClient.instance.post('/fabric/vote', {
        'electionId': eleccion.id,
        'candidateId': candidateId,
      });
      setState(() => _votadas[eleccion.id] = (data['txId'] ?? '') as String);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.mensaje)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo emitir el voto.')),
        );
      }
    } finally {
      if (mounted) setState(() => _enviando.remove(eleccion.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return _MensajeCentro(
        icono: Icons.error_outline,
        titulo: 'Error',
        detalle: _error!,
        accion: _cargar,
      );
    }
    if (_elecciones.isEmpty) {
      return _MensajeCentro(
        icono: Icons.how_to_vote_outlined,
        titulo: 'No hay papeletas activas',
        detalle:
            'Tu cuenta no está asignada a ningún canal con elección en curso.',
        accion: _cargar,
      );
    }

    return RefreshIndicator(
      onRefresh: _cargar,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _elecciones.length,
        itemBuilder: (_, i) => _tarjetaEleccion(_elecciones[i]),
      ),
    );
  }

  Widget _tarjetaEleccion(Eleccion e) {
    final txId = _votadas[e.id];
    final enviando = _enviando.contains(e.id);

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
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
            e.title,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: AppColors.texto1,
            ),
          ),
          if (e.description != null && e.description!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              e.description!,
              style: const TextStyle(fontSize: 13, color: AppColors.texto3),
            ),
          ],
          const SizedBox(height: 16),

          if (txId != null)
            _comprobanteEnLinea(txId)
          else ...[
            for (final c in e.candidatos)
              _opcionVoto(
                titulo: c.frontName,
                subtitulo: '${c.candidateName} · ${c.position}',
                onTap: enviando ? null : () => _votar(e, c.id),
              ),
            const Divider(height: 24),
            _opcionVoto(
              titulo: 'Voto en blanco',
              subtitulo: 'Voto válido sin candidato',
              onTap: enviando ? null : () => _votar(e, 'votos_blancos'),
            ),
            _opcionVoto(
              titulo: 'Voto nulo',
              subtitulo: 'Anula la papeleta',
              onTap: enviando ? null : () => _votar(e, 'votos_nulos'),
            ),
            if (enviando) ...[
              const SizedBox(height: 12),
              const Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _opcionVoto({
    required String titulo,
    required String subtitulo,
    required VoidCallback? onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: AppColors.fondo,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        titulo,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          color: AppColors.texto1,
                        ),
                      ),
                      Text(
                        subtitulo,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.texto3,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: AppColors.texto3),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _comprobanteEnLinea(String txId) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.exito.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(Icons.check_circle, color: AppColors.exito, size: 20),
              SizedBox(width: 8),
              Text(
                'Voto registrado en blockchain',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: AppColors.exito,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'ID de transacción:',
            style: TextStyle(fontSize: 11, color: AppColors.texto3),
          ),
          SelectableText(
            txId,
            style: const TextStyle(
              fontSize: 11,
              fontFamily: 'monospace',
              color: AppColors.texto2,
            ),
          ),
        ],
      ),
    );
  }
}

/// Mensaje centrado con ícono y botón de reintento, reutilizable.
class _MensajeCentro extends StatelessWidget {
  final IconData icono;
  final String titulo;
  final String detalle;
  final VoidCallback accion;

  const _MensajeCentro({
    required this.icono,
    required this.titulo,
    required this.detalle,
    required this.accion,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icono, size: 48, color: AppColors.texto3),
            const SizedBox(height: 16),
            Text(
              titulo,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.texto2,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              detalle,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: AppColors.texto3),
            ),
            const SizedBox(height: 20),
            OutlinedButton.icon(
              onPressed: accion,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Actualizar'),
            ),
          ],
        ),
      ),
    );
  }
}
