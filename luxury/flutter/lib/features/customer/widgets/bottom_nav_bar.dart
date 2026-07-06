import 'package:flutter/material.dart';
import 'package:luxury_tablet/core/theme/theme.dart';

class BottomNavBar extends StatelessWidget {
  final VoidCallback? onHomeTap;
  final VoidCallback? onSearchTap;
  final VoidCallback? onAllergensTap;
  final VoidCallback? onLanguageTap;

  const BottomNavBar({
    super.key,
    this.onHomeTap,
    this.onSearchTap,
    this.onAllergensTap,
    this.onLanguageTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 56,
      decoration: const BoxDecoration(
        color: LuxuryColors.charcoalDark,
        border: Border(
          top: BorderSide(color: LuxuryColors.warmDarkBrown, width: 0.5),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _NavItem(
            icon: Icons.home_outlined,
            label: 'HOME',
            onTap: onHomeTap,
          ),
          _NavItem(
            icon: Icons.search,
            label: 'SEARCH',
            onTap: onSearchTap,
          ),
          _NavItem(
            icon: Icons.warning_amber_outlined,
            label: 'ALLERGENS',
            onTap: onAllergensTap,
          ),
          _NavItem(
            icon: Icons.language,
            label: 'LANGUAGE',
            onTap: onLanguageTap,
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  const _NavItem({
    required this.icon,
    required this.label,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 80,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: LuxuryColors.grey, size: 20),
            const SizedBox(height: 4),
            Text(label, style: LuxuryTypography.navLabel),
          ],
        ),
      ),
    );
  }
}
