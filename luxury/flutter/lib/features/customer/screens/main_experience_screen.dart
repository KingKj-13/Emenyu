import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:luxury_tablet/core/repositories/menu_repository.dart';
import 'package:luxury_tablet/core/utils/media_url.dart';
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
  late final PageController _categoryController;

  @override
  void initState() {
    super.initState();
    _categoryController = PageController(initialPage: widget.initialCategoryIndex);
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
      }
    } catch (_) {}
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
    _categoryController.dispose();
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
            if (mounted) setState(() => _categories = categories);
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

    return Scaffold(
      backgroundColor: LuxuryColors.backgroundDarkest,
      // Swipe UP/DOWN to move between categories.
      body: PageView.builder(
        controller: _categoryController,
        scrollDirection: Axis.vertical,
        itemCount: _categories.length,
        itemBuilder: (context, index) {
          final category = _categories[index];
          final adjacent = <dynamic>[
            if (index > 0) ...(_categories[index - 1]['items'] as List<dynamic>? ?? []).take(2),
            if (index < _categories.length - 1)
              ...(_categories[index + 1]['items'] as List<dynamic>? ?? []).take(2),
          ];
          return _CategoryDishesView(
            key: ValueKey(category['id'] ?? category['name'] ?? index),
            category: category,
            adjacentPreloadItems: adjacent,
            onBack: () => Navigator.pop(context),
            onOpenDetail: _openItemDetail,
          );
        },
      ),
    );
  }
}

/// One category's full-bleed dish browser. Swipe LEFT/RIGHT to move
/// between dishes in this category — each dish is a fully independent
/// page (its own hero image + info), so the motion genuinely follows
/// the finger instead of just fading in after the fact.
class _CategoryDishesView extends StatefulWidget {
  final dynamic category;
  final List<dynamic> adjacentPreloadItems;
  final VoidCallback onBack;
  final void Function(dynamic item) onOpenDetail;

  const _CategoryDishesView({
    super.key,
    required this.category,
    required this.adjacentPreloadItems,
    required this.onBack,
    required this.onOpenDetail,
  });

  @override
  State<_CategoryDishesView> createState() => _CategoryDishesViewState();
}

class _CategoryDishesViewState extends State<_CategoryDishesView> {
  late final PageController _itemController;
  int _selectedItemIndex = 0;

  List<dynamic> get _items => (widget.category['items'] as List<dynamic>?) ?? [];

  @override
  void initState() {
    super.initState();
    _itemController = PageController();
    WidgetsBinding.instance.addPostFrameCallback((_) => _preloadImages());
  }

  void _preloadImages() {
    for (final item in _items) {
      _precache(item['heroImage'] as String?);
    }
    for (final item in widget.adjacentPreloadItems) {
      _precache(item['heroImage'] as String?);
    }
  }

  void _precache(String? path) {
    if (path == null || path.isEmpty || !mounted) return;
    final provider = path.startsWith('assets/')
        ? AssetImage(path) as ImageProvider
        : NetworkImage(resolveMediaUrl(path));
    precacheImage(provider, context).catchError((_) {});
  }

  void _jumpToItem(int index) {
    if (index == _selectedItemIndex) return;
    _itemController.animateToPage(
      index,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  void dispose() {
    _itemController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    final categoryName = (widget.category['name'] as String).toUpperCase();

    if (items.isEmpty) {
      return Scaffold(
        backgroundColor: LuxuryColors.backgroundDarkest,
        body: Center(
          child: Text('No items in $categoryName', style: LuxuryTypography.bodyMedium),
        ),
      );
    }

    return Scaffold(
      backgroundColor: LuxuryColors.backgroundDarkest,
      body: Column(
        children: [
          // TOP BAR
          SafeArea(
            bottom: false,
            child: Container(
              height: 56,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: const BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: LuxuryColors.warmDarkBrown, width: 0.5),
                ),
              ),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: widget.onBack,
                    behavior: HitTestBehavior.opaque,
                    child: const Padding(
                      padding: EdgeInsets.all(8.0),
                      child: Icon(Icons.arrow_back_ios_new, color: LuxuryColors.white, size: 18),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      categoryName,
                      style: LuxuryTypography.labelLarge.copyWith(color: LuxuryColors.white, letterSpacing: 2.0),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          ),

          // MAIN CONTENT
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
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: items.length,
                    itemBuilder: (context, index) => _SidebarRow(
                      item: items[index],
                      isSelected: index == _selectedItemIndex,
                      onTap: () => _jumpToItem(index),
                      onDoubleTap: () => widget.onOpenDetail(items[index]),
                    ),
                  ),
                ),

                // RIGHT — swipeable dish pages
                Expanded(
                  child: PageView.builder(
                    controller: _itemController,
                    scrollDirection: Axis.horizontal,
                    itemCount: items.length,
                    onPageChanged: (index) => setState(() => _selectedItemIndex = index),
                    itemBuilder: (context, index) => _DishPage(
                      item: items[index],
                      onTap: () => widget.onOpenDetail(items[index]),
                    ),
                  ),
                ),
              ],
            ),
          ),

          BottomNavBar(onHomeTap: widget.onBack),
        ],
      ),
    );
  }
}

class _DishPage extends StatelessWidget {
  final dynamic item;
  final VoidCallback onTap;

  const _DishPage({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final image = item['heroImage'] as String? ?? '';
    final name = item['name'] as String? ?? '';
    final origin = item['origin'] != null ? '${item['origin']['region']}, ${item['origin']['country']}' : '';
    final price = item['price'] ?? 0;
    final hasVideo = ((item['heroVideo'] as String?) ?? '').isNotEmpty;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (image.isNotEmpty)
            CinematicPan(
              child: LuxuryImage(
                path: image,
                fit: BoxFit.cover,
                width: double.infinity,
                height: double.infinity,
              ),
            ),
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [Colors.black.withOpacity(0.9), Colors.transparent],
                  stops: const [0.0, 0.45],
                ),
              ),
            ),
          ),
          if (hasVideo)
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
            bottom: 16,
            left: 24,
            right: 24,
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        name.toUpperCase(),
                        style: LuxuryTypography.labelLarge.copyWith(color: LuxuryColors.white, letterSpacing: 1.0),
                      ),
                      const SizedBox(height: 2),
                      Text(origin, style: LuxuryTypography.bodySmall),
                    ],
                  ),
                ),
                Text('R $price', style: LuxuryTypography.price),
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
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
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
