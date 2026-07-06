import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:luxury_tablet/core/repositories/menu_repository.dart';
import 'package:luxury_tablet/core/utils/media_url.dart';
import 'package:luxury_tablet/core/utils/swipe_gesture.dart';
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
      final jsonString = await rootBundle.loadString('assets/luxury_menu.json');
      final data = jsonDecode(jsonString);
      if (data != null && data['categories'] != null && mounted) {
        setState(() {
          _categories = data['categories'] as List<dynamic>;
        });
        _preloadCurrentAndAdjacent();
      }
    } catch (_) {}
  }

  List<dynamic> get _items =>
      (_categories.isEmpty ? [] : (_categories[_activeCategoryIndex]['items'] as List<dynamic>?)) ?? [];

  void _precache(String? path) {
    if (path == null || path.isEmpty || !mounted) return;
    final provider = path.startsWith('assets/')
        ? AssetImage(path) as ImageProvider
        : NetworkImage(resolveMediaUrl(path));
    precacheImage(provider, context).catchError((_) {});
  }

  /// Every ms counts on a demo floor: preload every dish in the current
  /// category immediately, plus the first couple of dishes in the
  /// categories a swipe-up/down would land on next.
  void _preloadCurrentAndAdjacent() {
    for (final item in _items) {
      _precache(item['heroImage'] as String?);
    }
    if (_activeCategoryIndex > 0) {
      for (final item in (_categories[_activeCategoryIndex - 1]['items'] as List<dynamic>? ?? []).take(2)) {
        _precache(item['heroImage'] as String?);
      }
    }
    if (_activeCategoryIndex < _categories.length - 1) {
      for (final item in (_categories[_activeCategoryIndex + 1]['items'] as List<dynamic>? ?? []).take(2)) {
        _precache(item['heroImage'] as String?);
      }
    }
  }

  void _selectItem(int index) {
    if (index < 0 || index >= _items.length) return;
    setState(() => _selectedItemIndex = index);
  }

  void _goToCategory(int index) {
    if (index < 0 || index >= _categories.length) return;
    setState(() {
      _activeCategoryIndex = index;
      _selectedItemIndex = 0;
    });
    _preloadCurrentAndAdjacent();
  }

  void _handleSwipe(DragEndDetails details) {
    switch (detectSwipe(details)) {
      case SwipeDirection.up:
        _goToCategory(_activeCategoryIndex + 1);
        break;
      case SwipeDirection.down:
        _goToCategory(_activeCategoryIndex - 1);
        break;
      case SwipeDirection.left:
        _selectItem(_selectedItemIndex + 1);
        break;
      case SwipeDirection.right:
        _selectItem(_selectedItemIndex - 1);
        break;
      case SwipeDirection.none:
        break;
    }
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
        transitionDuration: const Duration(milliseconds: 300),
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
              setState(() => _categories = categories);
              _preloadCurrentAndAdjacent();
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

    final activeCategory = _categories[_activeCategoryIndex];
    final categoryName = (activeCategory['name'] as String).toUpperCase();
    final items = _items;

    final selectedItem = items.isNotEmpty ? items[_selectedItemIndex] : null;
    final selectedImage = selectedItem?['heroImage'] as String? ?? '';
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
          // BACKGROUND — Full Bleed Hero Image (fades, doesn't slide)
          // ═══════════════════════════════════════════════
          if (selectedImage.isNotEmpty)
            CinematicPan(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 280),
                switchInCurve: Curves.easeOut,
                switchOutCurve: Curves.easeIn,
                child: LuxuryImage(
                  key: ValueKey('$_activeCategoryIndex-$selectedImage'),
                  path: selectedImage,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  height: double.infinity,
                ),
              ),
            ),

          // GRADIENT OVERLAYS for Text Legibility
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

          // FOREGROUND UI
          SafeArea(
            child: Column(
              children: [
                // TOP BAR
                Container(
                  height: 56,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: LuxuryColors.warmDarkBrown, width: 0.5)),
                  ),
                  child: Row(
                    children: [
                      GestureDetector(
                        onTap: () => Navigator.pop(context),
                        behavior: HitTestBehavior.opaque,
                        child: const Padding(
                          padding: EdgeInsets.all(8.0),
                          child: Icon(Icons.arrow_back_ios_new, color: LuxuryColors.white, size: 18),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 250),
                          child: Text(
                            categoryName,
                            key: ValueKey(categoryName),
                            style: LuxuryTypography.labelLarge.copyWith(color: LuxuryColors.white, letterSpacing: 2.0),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                // MAIN CONTENT — swipe up/down = category, left/right = dish
                Expanded(
                  child: Row(
                    children: [
                      // LEFT SIDEBAR — quick-jump list
                      Container(
                        width: 220,
                        decoration: const BoxDecoration(
                          border: Border(right: BorderSide(color: LuxuryColors.warmDarkBrown, width: 0.5)),
                        ),
                        child: ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          itemCount: items.length,
                          itemBuilder: (context, index) => _SidebarRow(
                            item: items[index],
                            isSelected: index == _selectedItemIndex,
                            onTap: () => _selectItem(index),
                            onDoubleTap: () => _openItemDetail(items[index]),
                          ),
                        ),
                      ),

                      // RIGHT PANEL — swipe + tap zone
                      Expanded(
                        child: GestureDetector(
                          onTap: () {
                            if (selectedItem != null) _openItemDetail(selectedItem);
                          },
                          onPanEnd: _handleSwipe,
                          behavior: HitTestBehavior.opaque,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              if (selectedItem?['heroVideo'] != null &&
                                  (selectedItem!['heroVideo'] as String).isNotEmpty)
                                Center(
                                  child: Container(
                                    width: 64,
                                    height: 64,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: Colors.black.withOpacity(0.5),
                                      border: Border.all(color: LuxuryColors.white.withOpacity(0.8), width: 2),
                                    ),
                                    child: const Icon(Icons.play_arrow_rounded, color: LuxuryColors.white, size: 36),
                                  ),
                                ),
                              Positioned(
                                bottom: 0,
                                left: 0,
                                right: 0,
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                                  child: AnimatedSwitcher(
                                    duration: const Duration(milliseconds: 250),
                                    child: Row(
                                      key: ValueKey('$_activeCategoryIndex-$_selectedItemIndex'),
                                      children: [
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              Text(
                                                selectedName.toUpperCase(),
                                                style: LuxuryTypography.labelLarge.copyWith(
                                                  color: LuxuryColors.white,
                                                  letterSpacing: 1.0,
                                                ),
                                              ),
                                              const SizedBox(height: 2),
                                              Text(selectedOrigin, style: LuxuryTypography.bodySmall),
                                            ],
                                          ),
                                        ),
                                        Text('R $selectedPrice', style: LuxuryTypography.price),
                                      ],
                                    ),
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

                BottomNavBar(
                  onHomeTap: () => Navigator.popUntil(context, (route) => route.isFirst),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SidebarRow extends StatelessWidget {
  final dynamic item;
  final bool isSelected;
  final VoidCallback onTap;
  final VoidCallback onDoubleTap;

  const _SidebarRow({
    required this.item,
    required this.isSelected,
    required this.onTap,
    required this.onDoubleTap,
  });

  @override
  Widget build(BuildContext context) {
    final itemName = item['name'] as String? ?? '';
    final itemOrigin = item['origin'] != null ? '${item['origin']['region']}, ${item['origin']['country']}' : '';
    final itemImage = item['heroImage'] as String? ?? '';
    final isChefPick = item['chefPick'] as bool? ?? false;

    return GestureDetector(
      onTap: onTap,
      onDoubleTap: onDoubleTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? LuxuryColors.warmDarkBrown.withOpacity(0.5) : Colors.transparent,
          border: Border(
            left: BorderSide(color: isSelected ? LuxuryColors.brushedBronze : Colors.transparent, width: 3),
          ),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: SizedBox(
                width: 56,
                height: 56,
                child: itemImage.isEmpty
                    ? Container(color: LuxuryColors.warmDarkBrown)
                    : LuxuryImage(path: itemImage, fit: BoxFit.cover, width: 56, height: 56),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    itemName.toUpperCase(),
                    style: LuxuryTypography.sidebarItemName.copyWith(
                      color: isSelected ? LuxuryColors.white : LuxuryColors.white.withOpacity(0.8),
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(itemOrigin, style: LuxuryTypography.sidebarItemOrigin, maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (isChefPick) ...[
                    const SizedBox(height: 3),
                    Text("CHEF'S PICK", style: LuxuryTypography.badge.copyWith(fontSize: 7)),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
