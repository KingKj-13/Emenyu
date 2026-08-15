import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class LuxuryColors {
  static const Color backgroundDarkest = Color(0xFF080808);
  static const Color charcoalDark = Color(0xFF171717);
  static const Color warmDarkBrown = Color(0xFF1F1B17);
  static const Color brushedBronze = Color(0xFFCBA26E);
  static const Color champagneGold = Color(0xFFEAD8B0);
  static const Color white = Color(0xFFFFFFFF);
  static const Color grey = Color(0xFF888888);
  static const Color darkGrey = Color(0xFF555555);
  static const Color surfaceDark = Color(0xFF121212);
  static const Color cardDark = Color(0xFF1A1A1A);
}

class LuxuryTypography {
  // Playfair Display — Primary headlines
  static TextStyle displayLarge = GoogleFonts.playfairDisplay(
    fontSize: 52,
    fontWeight: FontWeight.bold,
    color: LuxuryColors.white,
    height: 1.1,
  );

  static TextStyle displayMedium = GoogleFonts.playfairDisplay(
    fontSize: 38,
    fontWeight: FontWeight.bold,
    color: LuxuryColors.white,
    height: 1.2,
  );

  static TextStyle displaySmall = GoogleFonts.playfairDisplay(
    fontSize: 28,
    fontWeight: FontWeight.bold,
    color: LuxuryColors.white,
    height: 1.2,
  );

  // Cormorant Garamond — Italic accents
  static TextStyle accentLarge = GoogleFonts.cormorantGaramond(
    fontSize: 42,
    fontStyle: FontStyle.italic,
    color: LuxuryColors.brushedBronze,
  );

  static TextStyle accentMedium = GoogleFonts.cormorantGaramond(
    fontSize: 22,
    fontStyle: FontStyle.italic,
    color: LuxuryColors.brushedBronze,
  );

  static TextStyle accentSmall = GoogleFonts.cormorantGaramond(
    fontSize: 18,
    fontStyle: FontStyle.italic,
    color: LuxuryColors.champagneGold,
    letterSpacing: 3.0,
  );

  // Poppins — Body and UI
  static TextStyle bodyLarge = GoogleFonts.poppins(
    fontSize: 16,
    fontWeight: FontWeight.normal,
    color: LuxuryColors.white,
    height: 1.6,
  );

  static TextStyle bodyMedium = GoogleFonts.poppins(
    fontSize: 15,
    fontWeight: FontWeight.normal,
    color: LuxuryColors.grey,
    height: 1.6,
  );

  static TextStyle bodySmall = GoogleFonts.poppins(
    fontSize: 13,
    fontWeight: FontWeight.normal,
    color: LuxuryColors.grey,
    height: 1.4,
  );

  static TextStyle labelLarge = GoogleFonts.poppins(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: LuxuryColors.champagneGold,
    letterSpacing: 1.5,
  );

  static TextStyle labelMedium = GoogleFonts.poppins(
    fontSize: 11,
    fontWeight: FontWeight.w600,
    color: LuxuryColors.champagneGold,
    letterSpacing: 1.5,
  );

  static TextStyle labelSmall = GoogleFonts.poppins(
    fontSize: 9,
    fontWeight: FontWeight.w600,
    color: LuxuryColors.brushedBronze,
    letterSpacing: 1.0,
  );

  static TextStyle navLabel = GoogleFonts.poppins(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: LuxuryColors.grey,
    letterSpacing: 0.5,
  );

  static TextStyle price = GoogleFonts.poppins(
    fontSize: 24,
    fontWeight: FontWeight.w600,
    color: LuxuryColors.champagneGold,
  );

  static TextStyle priceSmall = GoogleFonts.poppins(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: LuxuryColors.champagneGold,
  );

  static TextStyle categoryLabel = GoogleFonts.poppins(
    fontSize: 13,
    fontWeight: FontWeight.w500,
    color: LuxuryColors.grey,
    letterSpacing: 1.5,
  );

  static TextStyle tab = GoogleFonts.poppins(
    fontSize: 11,
    fontWeight: FontWeight.w500,
    letterSpacing: 1.5,
    color: LuxuryColors.grey,
  );

  static TextStyle tabActive = GoogleFonts.poppins(
    fontSize: 11,
    fontWeight: FontWeight.w600,
    letterSpacing: 1.5,
    color: LuxuryColors.white,
  );

  static TextStyle badge = GoogleFonts.poppins(
    fontSize: 8,
    fontWeight: FontWeight.w600,
    color: LuxuryColors.brushedBronze,
    letterSpacing: 1.0,
  );

  static TextStyle buttonPrimary = GoogleFonts.poppins(
    fontSize: 12,
    fontWeight: FontWeight.w600,
    color: LuxuryColors.white,
    letterSpacing: 1.5,
  );

  static TextStyle sidebarItemName = GoogleFonts.poppins(
    fontSize: 11,
    fontWeight: FontWeight.w600,
    color: LuxuryColors.white,
    height: 1.3,
  );

  static TextStyle sidebarItemOrigin = GoogleFonts.poppins(
    fontSize: 9,
    fontWeight: FontWeight.w400,
    color: LuxuryColors.grey,
  );
}

class LuxuryTheme {
  static ThemeData get darkTheme {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: LuxuryColors.backgroundDarkest,
      primaryColor: LuxuryColors.brushedBronze,
      colorScheme: const ColorScheme.dark(
        primary: LuxuryColors.brushedBronze,
        secondary: LuxuryColors.champagneGold,
        surface: LuxuryColors.charcoalDark,
      ),
      textTheme: TextTheme(
        displayLarge: LuxuryTypography.displayLarge,
        displayMedium: LuxuryTypography.displayMedium,
        displaySmall: LuxuryTypography.displaySmall,
        headlineMedium: LuxuryTypography.accentMedium,
        bodyLarge: LuxuryTypography.bodyLarge,
        bodyMedium: LuxuryTypography.bodyMedium,
        bodySmall: LuxuryTypography.bodySmall,
        labelLarge: LuxuryTypography.labelLarge,
        labelMedium: LuxuryTypography.labelMedium,
        labelSmall: LuxuryTypography.labelSmall,
      ),
    );
  }
}
