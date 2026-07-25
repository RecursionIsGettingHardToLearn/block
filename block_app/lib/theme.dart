import 'package:flutter/material.dart';

/// Paleta de la app, alineada con la web (índigo como color de marca).
class AppColors {
  static const marca = Color(0xFF6366F1); // indigo-500
  static const fondo = Color(0xFFF8FAFC); // slate-50
  static const texto1 = Color(0xFF1E293B); // slate-800
  static const texto2 = Color(0xFF475569); // slate-600
  static const texto3 = Color(0xFF94A3B8); // slate-400
  static const exito = Color(0xFF16A34A); // green-600
  static const alerta = Color(0xFFD97706); // amber-600
}

/// Tema Material de la app.
ThemeData buildAppTheme() {
  return ThemeData(
    useMaterial3: true,
    scaffoldBackgroundColor: AppColors.fondo,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.marca,
      primary: AppColors.marca,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.marca,
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
  );
}
