import 'package:flutter/material.dart';
import 'services/session_service.dart';
import 'screens/login_screen.dart';
import 'screens/home_router.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Carga la sesión guardada antes de decidir la pantalla inicial.
  await SessionService.instance.cargar();
  runApp(const BlockApp());
}

class BlockApp extends StatelessWidget {
  const BlockApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FICCT E-Voting',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      // Si ya hay sesión, entra directo; si no, al login.
      home: SessionService.instance.autenticado
          ? const HomeRouter()
          : const LoginScreen(),
    );
  }
}
