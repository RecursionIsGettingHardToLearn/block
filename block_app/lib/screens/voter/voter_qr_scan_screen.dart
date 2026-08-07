import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../services/api_client.dart';
import '../../theme.dart';

/// Pantalla de escaneo QR para votantes.
///
/// El votante escanea el QR que descargó desde la web (que contiene su txId)
/// y la app consulta el endpoint GET /fabric/verify/:txId para confirmar
/// la veracidad e integridad del voto en la blockchain.
class VoterQrScanScreen extends StatefulWidget {
  const VoterQrScanScreen({super.key});

  @override
  State<VoterQrScanScreen> createState() => _VoterQrScanScreenState();
}

class _VoterQrScanScreenState extends State<VoterQrScanScreen> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );

  bool _procesando = false;
  bool _escaneando = true;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (!_escaneando || _procesando) return;

    final txId = capture.barcodes.firstOrNull?.rawValue;
    if (txId == null || txId.isEmpty) return;

    setState(() {
      _procesando = true;
      _escaneando = false;
    });

    await _controller.stop();
    await _verificarVoto(txId);
  }

  Future<void> _verificarVoto(String txId) async {
    try {
      final data = await ApiClient.instance
          .get('/fabric/verify/${Uri.encodeComponent(txId)}');
      if (!mounted) return;
      await _mostrarResultado(txId, data as Map<String, dynamic>);
    } on ApiException catch (e) {
      if (!mounted) return;
      await _mostrarError(txId, e.mensaje);
    } catch (_) {
      if (!mounted) return;
      await _mostrarError(txId, 'No se pudo conectar con el servidor.');
    }
  }

  Future<void> _mostrarResultado(
      String txId, Map<String, dynamic> data) async {
    final counted = data['counted'] as bool? ?? false;
    final source = data['source'] as String? ?? '—';
    final message = data['message'] as String? ?? '';
    final channel = data['channel'] as String? ?? '—';

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _ResultSheet(
        txId: txId,
        counted: counted,
        source: source,
        message: message,
        channel: channel,
      ),
    );

    _reiniciarEscaner();
  }

  Future<void> _mostrarError(String txId, String mensaje) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _ErrorSheet(txId: txId, mensaje: mensaje),
    );
    _reiniciarEscaner();
  }

  void _reiniciarEscaner() {
    if (!mounted) return;
    setState(() {
      _procesando = false;
      _escaneando = true;
    });
    _controller.start();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Visor de cámara
        MobileScanner(
          controller: _controller,
          onDetect: _onDetect,
        ),

        // Overlay con recuadro de guía
        _ScanOverlay(),

        // Indicador mientras se consulta la API
        if (_procesando)
          Container(
            color: Colors.black54,
            child: const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(color: Colors.white),
                  SizedBox(height: 16),
                  Text(
                    'Verificando voto…',
                    style: TextStyle(color: Colors.white, fontSize: 16),
                  ),
                ],
              ),
            ),
          ),

        // Botón de linterna
        Positioned(
          bottom: 40,
          left: 0,
          right: 0,
          child: Center(
            child: IconButton(
              onPressed: () => _controller.toggleTorch(),
              icon: const Icon(Icons.flashlight_on, size: 32),
              color: Colors.white,
              tooltip: 'Linterna',
            ),
          ),
        ),
      ],
    );
  }
}

/// Overlay semitransparente con recuadro de escaneo centrado.
class _ScanOverlay extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    const boxSize = 260.0;
    return LayoutBuilder(builder: (context, constraints) {
      final w = constraints.maxWidth;
      final h = constraints.maxHeight;
      final left = (w - boxSize) / 2;
      final top = (h - boxSize) / 2;

      return Stack(
        children: [
          // Oscurecer todo menos el recuadro
          ColorFiltered(
            colorFilter: ColorFilter.mode(
              Colors.black.withValues(alpha: 0.55),
              BlendMode.srcOut,
            ),
            child: Stack(
              children: [
                Container(
                  decoration: const BoxDecoration(
                    color: Colors.black,
                    backgroundBlendMode: BlendMode.dstOut,
                  ),
                ),
                Positioned(
                  left: left,
                  top: top,
                  child: Container(
                    width: boxSize,
                    height: boxSize,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Borde del recuadro y texto
          Positioned(
            left: left,
            top: top,
            child: Container(
              width: boxSize,
              height: boxSize,
              decoration: BoxDecoration(
                border: Border.all(color: AppColors.marca, width: 3),
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            top: top + boxSize + 20,
            child: const Text(
              'Apunta al QR de tu comprobante de voto',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            top: top - 44,
            child: const Text(
              'Verificación de voto',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      );
    });
  }
}

/// Hoja inferior con el resultado de la verificación.
class _ResultSheet extends StatelessWidget {
  final String txId;
  final bool counted;
  final String source;
  final String message;
  final String channel;

  const _ResultSheet({
    required this.txId,
    required this.counted,
    required this.source,
    required this.message,
    required this.channel,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: const Color(0xFFE2E8F0),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 24),

          // Ícono de estado
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: counted
                  ? AppColors.exito.withValues(alpha: 0.12)
                  : AppColors.alerta.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(
              counted ? Icons.verified_rounded : Icons.warning_amber_rounded,
              size: 36,
              color: counted ? AppColors.exito : AppColors.alerta,
            ),
          ),
          const SizedBox(height: 16),

          Text(
            counted ? '✓ Voto verificado' : '⚠ Voto no contabilizado',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: counted ? AppColors.exito : AppColors.alerta,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style:
                const TextStyle(fontSize: 14, color: AppColors.texto2),
          ),
          const SizedBox(height: 24),

          // Detalles técnicos
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                _DetailRow(label: 'Fuente', value: source),
                const SizedBox(height: 8),
                _DetailRow(label: 'Canal', value: channel),
                const SizedBox(height: 8),
                _DetailRow(
                  label: 'TX ID',
                  value: txId.length > 20
                      ? '${txId.substring(0, 10)}…${txId.substring(txId.length - 10)}'
                      : txId,
                  mono: true,
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Escanear otro'),
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  final bool mono;

  const _DetailRow({required this.label, required this.value, this.mono = false});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: const TextStyle(fontSize: 12, color: AppColors.texto3)),
        Flexible(
          child: Text(
            value,
            style: TextStyle(
              fontSize: 12,
              color: AppColors.texto1,
              fontFamily: mono ? 'monospace' : null,
              fontWeight: FontWeight.w600,
            ),
            textAlign: TextAlign.end,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

/// Hoja inferior de error al no poder verificar.
class _ErrorSheet extends StatelessWidget {
  final String txId;
  final String mensaje;

  const _ErrorSheet({required this.txId, required this.mensaje});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: const Color(0xFFE2E8F0),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 24),
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: Colors.red.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.error_outline,
                size: 36, color: Colors.red),
          ),
          const SizedBox(height: 16),
          const Text(
            'No se pudo verificar',
            style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: Colors.red),
          ),
          const SizedBox(height: 8),
          Text(
            mensaje,
            textAlign: TextAlign.center,
            style:
                const TextStyle(fontSize: 14, color: AppColors.texto2),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Intentar de nuevo'),
            ),
          ),
        ],
      ),
    );
  }
}
