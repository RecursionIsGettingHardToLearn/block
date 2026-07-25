import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../theme.dart';

/// Comprobantes de voto del votante: cada voto confirmado con su ID de
/// transacción en la blockchain. No revela por quién votó, solo que votó.
class VoterReceiptsScreen extends StatefulWidget {
  const VoterReceiptsScreen({super.key});

  @override
  State<VoterReceiptsScreen> createState() => _VoterReceiptsScreenState();
}

class _VoterReceiptsScreenState extends State<VoterReceiptsScreen> {
  bool _cargando = true;
  String? _error;
  List<dynamic> _recibos = [];

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
      final data = await ApiClient.instance.get('/fabric/my-receipts');
      setState(() => _recibos = data as List);
    } on ApiException catch (e) {
      setState(() => _error = e.mensaje);
    } catch (_) {
      setState(() => _error = 'No se pudieron cargar los comprobantes.');
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(child: Text(_error!));
    }
    if (_recibos.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            'Aún no tienes comprobantes. Aparecerán aquí cuando emitas un voto.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.texto3),
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _cargar,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _recibos.length,
        itemBuilder: (_, i) {
          final r = _recibos[i] as Map<String, dynamic>;
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.check_circle,
                        color: AppColors.exito, size: 18),
                    const SizedBox(width: 6),
                    Text(
                      (r['status'] ?? '') as String,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        color: AppColors.exito,
                        fontSize: 13,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      (r['channel'] ?? '—') as String,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.texto3,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                const Text(
                  'ID de transacción',
                  style: TextStyle(fontSize: 11, color: AppColors.texto3),
                ),
                SelectableText(
                  (r['txId'] ?? '') as String,
                  style: const TextStyle(
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: AppColors.texto2,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
