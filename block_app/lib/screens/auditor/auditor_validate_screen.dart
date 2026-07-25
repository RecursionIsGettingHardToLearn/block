import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../theme.dart';

/// Validación de un voto por su ID de transacción. El auditor pega un txId y el
/// backend verifica su estado en la blockchain.
class AuditorValidateScreen extends StatefulWidget {
  const AuditorValidateScreen({super.key});

  @override
  State<AuditorValidateScreen> createState() => _AuditorValidateScreenState();
}

class _AuditorValidateScreenState extends State<AuditorValidateScreen> {
  final _txCtrl = TextEditingController();
  bool _verificando = false;
  Map<String, dynamic>? _resultado;
  String? _error;

  @override
  void dispose() {
    _txCtrl.dispose();
    super.dispose();
  }

  Future<void> _verificar() async {
    final tx = _txCtrl.text.trim();
    if (tx.isEmpty) return;
    setState(() {
      _verificando = true;
      _error = null;
      _resultado = null;
    });
    try {
      final data = await ApiClient.instance.get('/fabric/verify/$tx');
      setState(() => _resultado = data as Map<String, dynamic>);
    } on ApiException catch (e) {
      setState(() => _error = e.mensaje);
    } catch (_) {
      setState(() => _error = 'No se pudo verificar el voto.');
    } finally {
      if (mounted) setState(() => _verificando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Verifica un voto por su ID de transacción en la blockchain.',
            style: TextStyle(color: AppColors.texto3, fontSize: 13),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _txCtrl,
            decoration: const InputDecoration(
              labelText: 'ID de transacción',
              prefixIcon: Icon(Icons.tag),
            ),
            onSubmitted: (_) => _verificar(),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _verificando ? null : _verificar,
            icon: _verificando
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.verified),
            label: const Text('Verificar'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: TextStyle(color: Colors.red.shade700)),
          ],
          if (_resultado != null) ...[
            const SizedBox(height: 20),
            _tarjetaResultado(_resultado!),
          ],
        ],
      ),
    );
  }

  Widget _tarjetaResultado(Map<String, dynamic> r) {
    final counted = (r['counted'] ?? false) as bool;
    final status = (r['status'] ?? '') as String;
    final color = counted ? AppColors.exito : AppColors.alerta;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(counted ? Icons.check_circle : Icons.info,
                  color: color, size: 22),
              const SizedBox(width: 8),
              Text(
                counted ? 'Voto contabilizado' : status,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  color: color,
                  fontSize: 15,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _fila('Estado', status),
          _fila('Fuente', (r['source'] ?? '') as String),
          _fila('Canal', (r['channel'] ?? '—') as String),
          _fila('Mensaje', (r['message'] ?? '') as String),
        ],
      ),
    );
  }

  Widget _fila(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 70,
            child: Text(
              k,
              style: const TextStyle(fontSize: 12, color: AppColors.texto3),
            ),
          ),
          Expanded(
            child: Text(
              v,
              style: const TextStyle(fontSize: 13, color: AppColors.texto1),
            ),
          ),
        ],
      ),
    );
  }
}
