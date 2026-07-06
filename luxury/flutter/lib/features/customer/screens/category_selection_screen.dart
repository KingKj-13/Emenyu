import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:luxury_tablet/features/customer/screens/main_experience_screen.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/core/widgets/cinematic_pan.dart';
import 'package:luxury_tablet/core/widgets/luxury_image.dart';
import 'package:luxury_tablet/core/utils/image_preloader.dart';

class CategorySelectionScreen extends StatefulWidget {
  const CategorySelectionScreen({super.key});

  @override
  State<CategorySelectionScreen> createState() =>
      _CategorySelectionScreenState();
}

class _CategorySelectionScreenState extends State<CategorySelectionScreen>
    with SingleTickerProviderStateMixin {
  List<dynamic> _categories = [];
  bool _isLoading = true;
  int _selectedIndex = 0;
  late AnimationController _fadeController;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _fadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _fadeAnimation = CurvedAnimation(
      parent: _fadeController,
      curve: Curves.easeIn,
    );
    _loadMenuJson();
  }

  Future<void> _loadMenuJson() async {
    try {
      final jsonString =
          await rootBundle.loadString('assets/luxury_menu.json');
      final data = jsonDecode(jsonString);

      if (data != null && data['categories'] != null) {
        setState(() {
          _categories = data['categories'] as List<dynamic>;
          _isLoading = false;
        });
        ImagePreloader.preloadAllImages(context, data);
        _fadeController.forward();
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _navigateToBrowse(int categoryIndex) {
    Navigator.push(
      context,
      PageRouteBuilder(
        pageBuilder: (_, __, ___) => MainExperienceScreen(
          initialCategoryIndex: categoryIndex,
        ),
        transitionsBuilder: (_, animation, __, child) {
          return FadeTransition(opacity: animation, child: child);
        },
        transitionDuration: const Duration(milliseconds: 500),
      ),
    );
  }

  String _getCategoryDescription(String name) {
    final descriptions = {
      'Starters': 'Handpicked creations by our chef, crafted with passion and the finest ingredients.',
      'Steaks': 'Premium cuts from the world\'s finest producers, dry-aged and grilled to perfection.',
      'Seafood': 'The ocean\'s finest treasures, sourced daily from sustainable fisheries worldwide.',
      'Champagne': 'An exquisite selection of the world\'s most prestigious champagne houses.',
      'Wines': 'A curated cellar of exceptional vintages from legendary wine regions.',
      'Whisky': 'Rare and distinguished single malts and blends from master distillers.',
      'Desserts': 'Artisan desserts crafted with precision, passion, and the finest ingredients.',
    };
    return descriptions[name] ??
        'Handpicked creations by our chef, crafted with passion and the finest ingredients.';
  }

  @override
  void dispose() {
    _fadeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: LuxuryColors.backgroundDarkest,
        body: Center(
          child:
              CircularProgressIndicator(color: LuxuryColors.brushedBronze),
        ),
      );
    }

    final selectedCategory =
        _categories.isNotEmpty ? _categories[_selectedIndex] : null;
    final categoryName =
        (selectedCategory?['name'] as String?)?.toUpperCase() ?? 'MENU';
    final items = (selectedCategory?['items'] as List<dynamic>?) ?? [];
    final firstItemImage =
        items.isNotEmpty ? (items[0]['heroImage'] as String? ?? '') : '';

    return Scaffold(
      backgroundColor: LuxuryColors.backgroundDarkest,
      body: FadeTransition(
        opacity: _fadeAnimation,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // ═══════════════════════════════════════════════════
            // BACKGROUND — Full Bleed Hero Image
            // ═══════════════════════════════════════════════════
            if (firstItemImage.isNotEmpty)
              CinematicPan(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 500),
                  child: LuxuryImage(
                    key: ValueKey(firstItemImage),
                    path: firstItemImage,
                    fit: BoxFit.cover,
                    width: double.infinity,
                    height: double.infinity,
                  ),
                ),
              ),

            // ═══════════════════════════════════════════════════
            // GRADIENT OVERLAY for text legibility
            // ═══════════════════════════════════════════════════
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [
                      Colors.black.withOpacity(0.95),
                      Colors.black.withOpacity(0.8),
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.35, 1.0],
                  ),
                ),
              ),
            ),
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [
                      Colors.black.withOpacity(0.9),
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.4],
                  ),
                ),
              ),
            ),

            // ═══════════════════════════════════════════════════
            // FOREGROUND UI
            // ═══════════════════════════════════════════════════
            Row(
              children: [
                // LEFT PANEL — Category list (floating)
                Container(
                  width: 280,
                  decoration: const BoxDecoration(
                    border: Border(
                      right: BorderSide(
                        color: LuxuryColors.warmDarkBrown, 
                        width: 0.5
                      ),
                    ),
                  ),
                  child: SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 28, vertical: 24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Logo
                          Row(
                            children: [
                              const Icon(
                                Icons.workspace_premium_outlined,
                                color: LuxuryColors.brushedBronze,
                                size: 22,
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
                          const SizedBox(height: 50),

                          // Category list
                          Expanded(
                            child: ListView.builder(
                              itemCount: _categories.length,
                              padding: EdgeInsets.zero,
                              itemBuilder: (context, index) {
                                final category = _categories[index];
                                final isActive = index == _selectedIndex;
                                final name = (category['name'] as String)
                                    .toUpperCase();

                                return GestureDetector(
                                  onTap: () {
                                    setState(() {
                                      _selectedIndex = index;
                                    });
                                  },
                                  behavior: HitTestBehavior.opaque,
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                        vertical: 16.0),
                                    child: Row(
                                      children: [
                                        // Gold dot indicator
                                        Container(
                                          width: 8,
                                          height: 8,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: isActive
                                                ? LuxuryColors.brushedBronze
                                                : LuxuryColors.darkGrey,
                                          ),
                                        ),
                                        const SizedBox(width: 16),
                                        Text(
                                          name,
                                          style: LuxuryTypography.categoryLabel
                                              .copyWith(
                                            color: isActive
                                                ? LuxuryColors.brushedBronze
                                                : LuxuryColors.grey,
                                            fontWeight: isActive
                                                ? FontWeight.w600
                                                : FontWeight.w400,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),

                          // Call Waiter
                          GestureDetector(
                            onTap: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                      'Waiter has been summoned to your table.'),
                                  duration: Duration(seconds: 2),
                                ),
                              );
                            },
                            behavior: HitTestBehavior.opaque,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Row(
                                children: [
                                  const Icon(
                                    Icons.notifications_none_outlined,
                                    color: LuxuryColors.champagneGold,
                                    size: 18,
                                  ),
                                  const SizedBox(width: 10),
                                  Text(
                                    'CALL WAITER',
                                    style: LuxuryTypography.labelMedium
                                        .copyWith(
                                      color: LuxuryColors.champagneGold,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                // RIGHT PANEL — Category info (floating)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(
                      left: 50,
                      right: 50,
                      bottom: 60,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Spacer(),
                        // Category heading
                        AnimatedSwitcher(
                          duration: const Duration(milliseconds: 400),
                          child: Column(
                            key: ValueKey(_selectedIndex),
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                categoryName,
                                style: LuxuryTypography.displayLarge.copyWith(
                                  fontSize: 38,
                                  letterSpacing: 2.0,
                                ),
                              ),
                              const SizedBox(height: 16),
                              SizedBox(
                                width: 350,
                                child: Text(
                                  _getCategoryDescription(
                                    selectedCategory?['name'] ?? '',
                                  ),
                                  style: LuxuryTypography.bodyMedium.copyWith(
                                    color: LuxuryColors.white.withOpacity(0.8),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 28),
                              // EXPLORE COLLECTION button
                              GestureDetector(
                                onTap: () => _navigateToBrowse(_selectedIndex),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 24,
                                    vertical: 14,
                                  ),
                                  decoration: BoxDecoration(
                                    border: Border.all(
                                      color: LuxuryColors.brushedBronze,
                                      width: 1.5,
                                    ),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        'EXPLORE COLLECTION',
                                        style: LuxuryTypography.buttonPrimary,
                                      ),
                                      const SizedBox(width: 10),
                                      const Icon(
                                        Icons.arrow_forward,
                                        color: LuxuryColors.white,
                                        size: 16,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
