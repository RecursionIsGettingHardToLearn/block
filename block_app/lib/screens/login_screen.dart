import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/session_service.dart';
import '../theme.dart';
import 'home_router.dart';

/// Pantalla de inicio de sesión. Envía identificador + contraseña al backend y,
/// si es correcto, guarda la sesión y entra al enrutador por rol.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _idCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _cargando = false;
  String? _error;

  @override
  void dispose() {
    _idCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final id = _idCtrl.text.trim();
    final pass = _passCtrl.text;
    if (id.isEmpty || pass.isEmpty) {
      setState(() => _error = 'Ingresa tu registro y contraseña.');
      return;
    }
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final data = await ApiClient.instance.post('/auth/login', {
        'identificador': id,
        'password': pass,
      });
      await SessionService.instance.guardar(
        data['access_token'] as String,
        data['user'] as Map<String, dynamic>,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeRouter()),
      );
    } on ApiException catch (e) {
      setState(() => _error = e.mensaje);
    } catch (_) {
      setState(
        () => _error =
            'No se pudo conectar con el servidor. Revisa la dirección de la API.',
      );
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.fondo,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.marca.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(Icons.how_to_vote,
                      color: AppColors.marca, size: 36),
                ),
                const SizedBox(height: 20),
                const Text(
                  'FICCT E-Voting',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: AppColors.texto1,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Sistema de votación sobre blockchain',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: AppColors.texto3),
                ),
                const SizedBox(height: 32),
                TextField(
                  controller: _idCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Registro o correo',
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _passCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Contraseña',
                    prefixIcon: Icon(Icons.lock_outline),
                  ),
                  onSubmitted: (_) => _login(),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      _error!,
                      style:
                          TextStyle(color: Colors.red.shade700, fontSize: 13),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _cargando ? null : _login,
                  child: _cargando
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Ingresar'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
