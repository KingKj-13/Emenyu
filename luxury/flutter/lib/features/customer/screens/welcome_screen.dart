import 'dart:async';
import 'package:flutter/material.dart';
import 'package:luxury_tablet/features/customer/screens/category_selection_screen.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/features/customer/widgets/developer_menu.dart';
import 'package:luxury_tablet/core/services/update_service.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen>
    with SingleTickerProviderStateMixin {
  int _logoTapCount = 0;
  Timer? _tapResetTimer;
  late AnimationController _fadeController;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();

    _fadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );
    _fadeAnimation = CurvedAnimation(
      parent: _fadeController,
      curve: Curves.easeIn,
    );
    _fadeController.forward();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      UpdateService().checkForUpdates(
        context: context,
        baseUrl: 'http://127.0.0.1:8000/api/v1',
        currentVersionName: '1.0.0',
        currentVersionCode: 1,
      );
    });
  }

  void _handleLogoTap() {
    _tapResetTimer?.cancel();
    setState(() {
      _logoTapCount++;
    });

    if (_logoTapCount == 7) {
      _logoTapCount = 0;
      DeveloperMenuBottomSheet.show(
        context,
        versionName: '1.0.0',
        versionCode: 1,
        backendUrl: 'http://127.0.0.1:8000/api/v1',
        deviceId: 'tablet-trump-luxury-007',
        wsStatus: 'Connected',
      );
    } else {
      _tapResetTimer = Timer(const Duration(seconds: 2), () {
        if (mounted) {
          setState(() {
            _logoTapCount = 0;
          });
        }
      });
    }
  }

  void _navigateToMenu() {
    Navigator.push(
      context,
      PageRouteBuilder(
        pageBuilder: (_, __, ___) => const CategorySelectionScreen(),
        transitionsBuilder: (_, animation, __, child) {
          return FadeTransition(opacity: animation, child: child);
        },
        transitionDuration: const Duration(milliseconds: 800),
      ),
    );
  }

  @override
  void dispose() {
    _tapResetTimer?.cancel();
    _fadeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: FadeTransition(
        opacity: _fadeAnimation,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Full-bleed dark background
            Container(color: LuxuryColors.backgroundDarkest),

            // Background restaurant interior
            Image.asset(
              'assets/images/restaurant_interior.png',
              fit: BoxFit.cover,
              width: double.infinity,
              height: double.infinity,
              errorBuilder: (_, __, ___) => Container(
                color: LuxuryColors.warmDarkBrown,
              ),
            ),

            // Dark vignette overlay
            Container(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.center,
                  radius: 1.0,
                  colors: [
                    Colors.transparent,
                    Colors.black.withOpacity(0.7),
                  ],
                ),
              ),
            ),

            // Top bar: Logo + EN/Menu
            Positioned(
              top: 30,
              left: 40,
              right: 40,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Trump logo (tappable for dev menu)
                  GestureDetector(
                    onTap: _handleLogoTap,
                    behavior: HitTestBehavior.opaque,
                    child: Row(
                      children: [
                        Icon(
                          Icons.workspace_premium_outlined,
                          color: LuxuryColors.brushedBronze,
                          size: 24,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'TRUMP',
                          style: LuxuryTypography.labelMedium.copyWith(
                            color: LuxuryColors.white,
                            letterSpacing: 2.0,
                          ),
                        ),
                      ],
                    ),
                  ),
                  // EN dropdown + hamburger
                  Row(
                    children: [
                      Text(
                        'EN',
                        style: LuxuryTypography.labelMedium.copyWith(
                          color: LuxuryColors.champagneGold,
                        ),
                      ),
                      const Icon(
                        Icons.keyboard_arrow_down,
                        color: LuxuryColors.champagneGold,
                        size: 18,
                      ),
                      const SizedBox(width: 24),
                      const Icon(
                        Icons.menu,
                        color: LuxuryColors.white,
                        size: 22,
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Center content
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'WELCOME TO',
                    style: LuxuryTypography.accentSmall.copyWith(
                      fontSize: 18,
                      letterSpacing: 4.0,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'TRUMP',
                    style: LuxuryTypography.displayLarge.copyWith(
                      fontSize: 68,
                      letterSpacing: 8.0,
                    ),
                  ),
                  Text(
                    'Restaurant',
                    style: LuxuryTypography.accentLarge.copyWith(
                      fontSize: 40,
                    ),
                  ),
                  const SizedBox(height: 36),
                  Text(
                    'EXTRAORDINARY INGREDIENTS. TIMELESS EXPERIENCE.',
                    style: LuxuryTypography.labelMedium.copyWith(
                      letterSpacing: 3.0,
                      color: LuxuryColors.champagneGold,
                    ),
                  ),
                  const SizedBox(height: 48),

                  // BEGIN YOUR JOURNEY button
                  GestureDetector(
                    onTap: _navigateToMenu,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 36,
                        vertical: 16,
                      ),
                      decoration: BoxDecoration(
                        color: LuxuryColors.brushedBronze.withOpacity(0.1),
                        border: Border.all(
                          color: LuxuryColors.brushedBronze,
                          width: 1.5,
                        ),
                      ),
                      child: Text(
                        'BEGIN YOUR JOURNEY',
                        style: LuxuryTypography.buttonPrimary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
