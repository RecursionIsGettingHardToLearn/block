import 'package:flutter/material.dart';
import '../models/usuario.dart';
import '../services/session_service.dart';
import '../theme.dart';
import 'login_screen.dart';
import 'voter/voter_vote_screen.dart';
import 'voter/voter_receipts_screen.dart';
import 'voter/voter_qr_scan_screen.dart';
import 'auditor/auditor_validate_screen.dart';
import 'auditor/auditor_elections_screen.dart';
import 'admin/admin_dashboard_screen.dart';
import 'admin/admin_results_screen.dart';

/// Un ítem de navegación: su pantalla, su ícono y su etiqueta.
class _NavItem {
  final Widget pantalla;
  final IconData icono;
  final String etiqueta;
  const _NavItem(this.pantalla, this.icono, this.etiqueta);
}

/// Enruta al usuario según su rol y presenta las pantallas con una barra de
/// navegación inferior (el equivalente móvil del sidebar de escritorio). Cada
/// rol ve solo sus destinos.
class HomeRouter extends StatefulWidget {
  const HomeRouter({super.key});

  @override
  State<HomeRouter> createState() => _HomeRouterState();
}

class _HomeRouterState extends State<HomeRouter> {
  int _indice = 0;

  List<_NavItem> _itemsPara(Rol rol) {
    switch (rol) {
      case Rol.votante:
        return const [
          _NavItem(VoterVoteScreen(), Icons.how_to_vote, 'Votar'),
          _NavItem(VoterReceiptsScreen(), Icons.receipt_long, 'Comprobantes'),
          _NavItem(VoterQrScanScreen(), Icons.qr_code_scanner, 'Verificar QR'),
        ];
      case Rol.auditor:
        return const [
          _NavItem(AuditorValidateScreen(), Icons.verified, 'Validar'),
          _NavItem(AuditorElectionsScreen(), Icons.how_to_vote, 'Elecciones'),
        ];
      case Rol.administrador:
        return const [
          _NavItem(AdminDashboardScreen(), Icons.dashboard, 'Panel'),
          _NavItem(AdminResultsScreen(), Icons.bar_chart, 'Resultados'),
        ];
      case Rol.desconocido:
        return const [];
    }
  }

  Future<void> _cerrarSesion() async {
    await SessionService.instance.cerrar();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final usuario = SessionService.instance.usuario;
    if (usuario == null) return const LoginScreen();

    final items = _itemsPara(usuario.rol);
    if (items.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Sin acceso')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Tu rol no tiene pantallas disponibles en la app móvil.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _cerrarSesion,
                  child: const Text('Cerrar sesión'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    // Si el índice quedó fuera de rango (p. ej. tras cambiar de rol), corregir.
    final indice = _indice.clamp(0, items.length - 1);

    return Scaffold(
      appBar: AppBar(
        title: Text(items[indice].etiqueta),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Center(
              child: Text(
                usuario.name,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.texto2,
                ),
              ),
            ),
          ),
          IconButton(
            onPressed: _cerrarSesion,
            icon: const Icon(Icons.logout),
            tooltip: 'Cerrar sesión',
          ),
        ],
      ),
      body: items[indice].pantalla,
      bottomNavigationBar: items.length < 2
          ? null
          : NavigationBar(
              selectedIndex: indice,
              onDestinationSelected: (i) => setState(() => _indice = i),
              destinations: [
                for (final item in items)
                  NavigationDestination(
                    icon: Icon(item.icono),
                    label: item.etiqueta,
                  ),
              ],
            ),
    );
  }
}
