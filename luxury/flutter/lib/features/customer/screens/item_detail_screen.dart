import 'package:flutter/material.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/core/utils/media_url.dart';
import 'package:luxury_tablet/core/utils/swipe_gesture.dart';
import 'package:luxury_tablet/features/customer/widgets/bottom_nav_bar.dart';
import 'package:luxury_tablet/core/widgets/living_photograph.dart';
import 'package:luxury_tablet/features/customer/widgets/story_renderer.dart';

import 'package:luxury_tablet/features/customer/widgets/pairing_dialog.dart';

class ItemDetailScreen extends StatefulWidget {
  final dynamic item;
  final List<dynamic> categories;

  const ItemDetailScreen({
    super.key,
    required this.item,
    required this.categories,
  });

  @override
  State<ItemDetailScreen> createState() => _ItemDetailScreenState();
}

class _ItemDetailScreenState extends State<ItemDetailScreen> {
  bool _isFavorited = false;
  bool _isFullScreenImage = false;
  late dynamic _currentItem;
  late List<dynamic> _siblingItems;

  @override
  void initState() {
    super.initState();
    _currentItem = widget.item;
    _siblingItems = _findSiblingItems();
    WidgetsBinding.instance.addPostFrameCallback((_) => _preloadSiblings());
  }

  /// The dish list of whichever category the opened dish belongs to —
  /// swiping should stay within that category.
  List<dynamic> _findSiblingItems() {
    for (final category in widget.categories) {
      final items = (category['items'] as List<dynamic>?) ?? [];
      if (items.any((i) => i['id'] == widget.item['id'])) return items;
    }
    return [widget.item];
  }

  void _precache(String? path) {
    if (path == null || path.isEmpty || !mounted) return;
    final provider = path.startsWith('assets/')
        ? AssetImage(path) as ImageProvider
        : NetworkImage(resolveMediaUrl(path));
    precacheImage(provider, context).catchError((_) {});
  }

  void _preloadSiblings() {
    for (final item in _siblingItems) {
      _precache(item['heroImage'] as String?);
    }
  }

  void _goToItem(int delta) {
    final index = _siblingItems.indexOf(_currentItem);
    final next = index + delta;
    if (next < 0 || next >= _siblingItems.length) return;
    setState(() => _currentItem = _siblingItems[next]);
  }

  void _handleSwipe(DragEndDetails details) {
    switch (detectSwipe(details)) {
      case SwipeDirection.left:
        _goToItem(1);
        break;
      case SwipeDirection.right:
        _goToItem(-1);
        break;
      case SwipeDirection.up:
      case SwipeDirection.down:
      case SwipeDirection.none:
        break;
    }
  }

  String get _itemName => _currentItem['name'] as String? ?? '';
  String get _originText {
    final origin = _currentItem['origin'];
    if (origin == null) return '';
    return '${origin['region']}, ${origin['country']}';
  }

  bool get _isChefPick => _currentItem['chefPick'] as bool? ?? false;
  int get _price => _currentItem['price'] as int? ?? 0;
  String get _heroImage => _currentItem['heroImage'] as String? ?? '';
  String get _heroVideo => _currentItem['heroVideo'] as String? ?? '';
  String get _description =>
      _currentItem['editorialDescription'] as String? ?? '';
  String get _ingredientStory =>
      _currentItem['ingredientStory'] as String? ?? '';
  String get _chefStory => _currentItem['chefStory'] as String? ?? '';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: LuxuryColors.backgroundDarkest,
      body: GestureDetector(
        onPanEnd: _handleSwipe,
        behavior: HitTestBehavior.opaque,
        child: Stack(
        fit: StackFit.expand,
        children: [
          // ═══════════════════════════════════════════════
          // BACKGROUND — Full Bleed Hero Image (fades between dishes)
          // ═══════════════════════════════════════════════
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 280),
            switchInCurve: Curves.easeOut,
            switchOutCurve: Curves.easeIn,
            child: LivingPhotograph(
              key: ValueKey(_currentItem['id']),
              imageUrl: _heroImage,
              videoUrl: _heroVideo,
              borderRadius: 0,
            ),
          ),

          // ═══════════════════════════════════════════════
          // GRADIENT OVERLAYS for Text Legibility
          // ═══════════════════════════════════════════════
          if (!_isFullScreenImage)
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
                    stops: const [0.0, 0.4, 1.0],
                  ),
                ),
              ),
            ),
          if (!_isFullScreenImage)
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
          if (!_isFullScreenImage)
            SafeArea(
              child: Column(
                children: [
                  // TOP BAR
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
                      // Back button
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
                      const Spacer(),
                      // Favorite heart
                      GestureDetector(
                        onTap: () {
                          setState(() {
                            _isFavorited = !_isFavorited;
                          });
                        },
                        child: Icon(
                          _isFavorited
                              ? Icons.favorite
                              : Icons.favorite_border,
                          color: _isFavorited
                              ? LuxuryColors.brushedBronze
                              : LuxuryColors.white,
                          size: 22,
                        ),
                      ),
                    ],
                  ),
                ),

                // MAIN CONTENT
                Expanded(
                  child: Row(
                    children: [
                      // LEFT — Item details + story tabs
                      Expanded(
                        flex: 35,
                        child: Padding(
                          padding: const EdgeInsets.only(
                            left: 40,
                            top: 32,
                            right: 24,
                            bottom: 16,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Item name
                              Text(
                                _itemName.toUpperCase(),
                                style: LuxuryTypography.displayMedium.copyWith(
                                  fontSize: 28,
                                  letterSpacing: 1.0,
                                ),
                              ),
                              const SizedBox(height: 8),

                              // Origin
                              Text(
                                _originText,
                                style: LuxuryTypography.bodySmall,
                              ),
                              const SizedBox(height: 10),

                              // Chef's Pick badge
                              if (_isChefPick)
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 4,
                                  ),
                                  decoration: BoxDecoration(
                                    border: Border.all(
                                      color: LuxuryColors.brushedBronze,
                                    ),
                                  ),
                                  child: Text(
                                    "CHEF'S PICK",
                                    style: LuxuryTypography.badge,
                                  ),
                                ),
                              const SizedBox(height: 24),

                              // Story tabs + content
                              Expanded(
                                child: SingleChildScrollView(
                                  physics: const BouncingScrollPhysics(),
                                  child: StoryRenderer(
                                    description: _description,
                                    ingredientStory: _ingredientStory,
                                    originStory: _originText,
                                    chefStory: _chefStory,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      // RIGHT — Empty space so image shows through
                      Expanded(
                        flex: 65,
                        child: const SizedBox.shrink(),
                      ),
                    ],
                  ),
                ),

                // BOTTOM ACTION BAR
                Container(
                  height: 64,
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  decoration: const BoxDecoration(
                    border: Border(
                      top: BorderSide(
                          color: LuxuryColors.warmDarkBrown, width: 0.5),
                    ),
                  ),
                  child: Row(
                    children: [
                      // Price
                      Text(
                        'R $_price',
                        style: LuxuryTypography.price,
                      ),
                      const Spacer(),

                      // RECOMMENDED PAIRING button
                      GestureDetector(
                        onTap: () {
                          showDialog(
                            context: context,
                            builder: (context) => PairingDialog(
                              baseItem: _currentItem,
                              categories: widget.categories,
                            ),
                          );
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 12,
                          ),
                          decoration: BoxDecoration(
                            color: LuxuryColors.brushedBronze,
                          ),
                          child: Text(
                            'RECOMMENDED PAIRING',
                            style: LuxuryTypography.buttonPrimary.copyWith(
                              color: LuxuryColors.backgroundDarkest,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),

                      // CALL WAITER button
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
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 12,
                          ),
                          decoration: BoxDecoration(
                            border: Border.all(
                              color: LuxuryColors.brushedBronze,
                              width: 1.5,
                            ),
                          ),
                          child: Text(
                            'CALL WAITER',
                            style: LuxuryTypography.buttonPrimary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                // BOTTOM NAV
                BottomNavBar(
                  onHomeTap: () {
                    // Pop all the way back to category selection
                    Navigator.popUntil(context, (route) => route.isFirst);
                  },
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
