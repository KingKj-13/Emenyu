import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:luxury_tablet/core/repositories/menu_repository.dart';
import 'package:luxury_tablet/features/customer/screens/item_detail_screen.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/features/customer/widgets/bottom_nav_bar.dart';
import 'package:luxury_tablet/core/widgets/cinematic_pan.dart';
import 'package:luxury_tablet/core/widgets/luxury_image.dart';

class MainExperienceScreen extends ConsumerStatefulWidget {
  final int initialCategoryIndex;

  const MainExperienceScreen({
    super.key,
    this.initialCategoryIndex = 0,
  });

  @override
  ConsumerState<MainExperienceScreen> createState() => _MainExperienceScreenState();
}

class _MainExperienceScreenState extends ConsumerState<MainExperienceScreen> {
  List<dynamic> _categories = [];
  bool _isLoading = true;
  late int _activeCategoryIndex;
  int _selectedItemIndex = 0;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _activeCategoryIndex = widget.initialCategoryIndex;
  }

  Future<void> _fallbackLoadJson() async {
    if (_categories.isNotEmpty) return;
    try {
      final jsonString =
          await rootBundle.loadString('assets/luxury_menu.json');
      final data = jsonDecode(jsonString);

      if (data != null && data['categories'] != null) {
        if (mounted) {
          setState(() {
            _categories = data['categories'] as List<dynamic>;
          });
          _preloadImages();
        }
      }
    } catch (_) {}
  }

  void _preloadImages() {
    if (_categories.isEmpty) return;
    final items =
        (_categories[_activeCategoryIndex]['items'] as List<dynamic>?) ?? [];
    for (final item in items) {
      final image = item['heroImage'] as String?;
      if (image != null && image.startsWith('assets/')) {
        precacheImage(AssetImage(image), context).catchError((_) {});
      }
    }
  }

  void _selectItem(int index) {
    setState(() {
      _selectedItemIndex = index;
    });
  }

  void _openItemDetail(dynamic item) {
    Navigator.push(
      context,
      PageRouteBuilder(
        pageBuilder: (_, __, ___) => ItemDetailScreen(
          item: item,
          categories: _categories,
        ),
        transitionsBuilder: (_, animation, __, child) {
          return FadeTransition(opacity: animation, child: child);
        },
        transitionDuration: const Duration(milliseconds: 400),
      ),
    );
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final menuAsync = ref.watch(menuTreeProvider);

    return menuAsync.when(
      loading: () => const Scaffold(
        backgroundColor: LuxuryColors.backgroundDarkest,
        body: Center(
          child: CircularProgressIndicator(color: LuxuryColors.brushedBronze),
        ),
      ),
      error: (err, stack) {
        _fallbackLoadJson();
        return _buildMainContent();
      },
      data: (categories) {
        if (categories.isEmpty) {
          _fallbackLoadJson();
        } else if (_categories.isEmpty || _categories != categories) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              setState(() {
                _categories = categories;
              });
              _preloadImages();
            }
          });
        }
        return _buildMainContent();
      },
    );
  }

  Widget _buildMainContent() {
    if (_categories.isEmpty) {
      return const Scaffold(
        backgroundColor: LuxuryColors.backgroundDarkest,
        body: Center(
          child: CircularProgressIndicator(color: LuxuryColors.brushedBronze),
        ),
      );
    }

    if (_categories.isEmpty) {
      return const Scaffold(
        backgroundColor: LuxuryColors.backgroundDarkest,
        body: Center(child: Text('No menu data available')),
      );
    }

    final activeCategory = _categories[_activeCategoryIndex];
    final categoryName =
        (activeCategory['name'] as String).toUpperCase();
    final items = (activeCategory['items'] as List<dynamic>?) ?? [];

    final selectedItem =
        items.isNotEmpty ? items[_selectedItemIndex] : null;
    final selectedImage =
        selectedItem?['heroImage'] as String? ?? '';
    final selectedName = selectedItem?['name'] as String? ?? '';
    final selectedOrigin = selectedItem?['origin'] != null
        ? '${selectedItem!['origin']['region']}, ${selectedItem['origin']['country']}'
        : '';
    final selectedPrice = selectedItem?['price'] ?? 0;

    return Scaffold(
      backgroundColor: LuxuryColors.backgroundDarkest,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // ═══════════════════════════════════════════════
          // BACKGROUND — Full Bleed Hero Image
          // ═══════════════════════════════════════════════
          if (selectedImage.isNotEmpty)
            CinematicPan(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 400),
                child: LuxuryImage(
                  key: ValueKey(selectedImage),
                  path: selectedImage,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  height: double.infinity,
                ),
              ),
            ),
          
          // ═══════════════════════════════════════════════
          // GRADIENT OVERLAYS for Text Legibility
          // ═══════════════════════════════════════════════
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                  colors: [
                    Colors.black.withOpacity(0.95),
                    Colors.black.withOpacity(0.8),
                    Colors.black.withOpacity(0.2),
                  ],
                  stops: const [0.0, 0.45, 1.0],
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

          // ═══════════════════════════════════════════════
          // FOREGROUND UI
          // ═══════════════════════════════════════════════
          SafeArea(
            child: Column(
              children: [
                // TOP BAR (Floating)
                Container(
                  height: 56,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  decoration: const BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                          color: LuxuryColors.warmDarkBrown, width: 0.5),
                    ),
                  ),
                  child: Row(
                    children: [
                      GestureDetector(
                        onTap: () => Navigator.pop(context),
                        behavior: HitTestBehavior.opaque,
                        child: const Padding(
                          padding: EdgeInsets.all(8.0),
                          child: Icon(
                            Icons.arrow_back_ios_new,
                            color: LuxuryColors.white,
                            size: 18,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          categoryName,
                          style: LuxuryTypography.labelLarge.copyWith(
                            color: LuxuryColors.white,
                            letterSpacing: 2.0,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),

              // MAIN CONTENT
              Expanded(
                child: Row(
                  children: [
                    // LEFT SIDEBAR — Item thumbnails list (Floating)
                    Container(
                      width: 220,
                      decoration: const BoxDecoration(
                        border: Border(
                          right: BorderSide(
                              color: LuxuryColors.warmDarkBrown, width: 0.5),
                        ),
                      ),
                      child: ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        itemCount: items.length,
                        itemBuilder: (context, index) {
                          final item = items[index];
                          final isSelected = index == _selectedItemIndex;
                          final itemName = item['name'] as String? ?? '';
                          final itemOrigin = item['origin'] != null
                              ? '${item['origin']['region']}, ${item['origin']['country']}'
                              : '';
                          final itemImage =
                              item['heroImage'] as String? ?? '';
                          final isChefPick =
                              item['chefPick'] as bool? ?? false;

                          return GestureDetector(
                            onTap: () => _selectItem(index),
                            onDoubleTap: () => _openItemDetail(item),
                            behavior: HitTestBehavior.opaque,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? LuxuryColors.warmDarkBrown
                                        .withOpacity(0.5)
                                    : Colors.transparent,
                                border: Border(
                                  left: BorderSide(
                                    color: isSelected
                                        ? LuxuryColors.brushedBronze
                                        : Colors.transparent,
                                    width: 3,
                                  ),
                                ),
                              ),
                              child: Row(
                                children: [
                                  ClipRRect(
                                    borderRadius:
                                        BorderRadius.circular(4),
                                    child: SizedBox(
                                      width: 56,
                                      height: 56,
                                      child: itemImage.isNotEmpty
                                          ? Image.asset(
                                              itemImage,
                                              fit: BoxFit.cover,
                                              errorBuilder:
                                                  (_, __, ___) =>
                                                      Container(
                                                color: LuxuryColors
                                                    .warmDarkBrown,
                                              ),
                                            )
                                          : Container(
                                              color: LuxuryColors
                                                  .warmDarkBrown,
                                            ),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          itemName.toUpperCase(),
                                          style: LuxuryTypography
                                              .sidebarItemName
                                              .copyWith(
                                            color: isSelected
                                                ? LuxuryColors.white
                                                : LuxuryColors.white
                                                    .withOpacity(0.8),
                                          ),
                                          maxLines: 2,
                                          overflow:
                                              TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          itemOrigin,
                                          style: LuxuryTypography
                                              .sidebarItemOrigin,
                                          maxLines: 1,
                                          overflow:
                                              TextOverflow.ellipsis,
                                        ),
                                        if (isChefPick) ...[
                                          const SizedBox(height: 3),
                                          Text(
                                            "CHEF'S PICK",
                                            style: LuxuryTypography
                                                .badge
                                                .copyWith(fontSize: 7),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),

                    // RIGHT PANEL — Interactive Overlays
                    Expanded(
                      child: GestureDetector(
                        onTap: () {
                          if (selectedItem != null) {
                            _openItemDetail(selectedItem);
                          }
                        },
                        behavior: HitTestBehavior.opaque,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            // Play button overlay
                            if (selectedItem?['heroVideo'] != null &&
                                (selectedItem!['heroVideo'] as String)
                                    .isNotEmpty)
                              Center(
                                child: Container(
                                  width: 64,
                                  height: 64,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: Colors.black.withOpacity(0.5),
                                    border: Border.all(
                                      color: LuxuryColors.white
                                          .withOpacity(0.8),
                                      width: 2,
                                    ),
                                  ),
                                  child: const Icon(
                                    Icons.play_arrow_rounded,
                                    color: LuxuryColors.white,
                                    size: 36,
                                  ),
                                ),
                              ),

                            // Bottom info bar (Floating)
                            Positioned(
                              bottom: 0,
                              left: 0,
                              right: 0,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 24,
                                  vertical: 16,
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text(
                                            selectedName.toUpperCase(),
                                            style: LuxuryTypography
                                                .labelLarge
                                                .copyWith(
                                              color: LuxuryColors.white,
                                              letterSpacing: 1.0,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            selectedOrigin,
                                            style: LuxuryTypography
                                                .bodySmall,
                                          ),
                                        ],
                                      ),
                                    ),
                                    Text(
                                      'R $selectedPrice',
                                      style: LuxuryTypography.price,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // BOTTOM NAV BAR
              BottomNavBar(
                onHomeTap: () {
                  Navigator.pop(context);
                },
              ),
            ],
          ),
          ),
        ],
      ),
    );
  }
}
