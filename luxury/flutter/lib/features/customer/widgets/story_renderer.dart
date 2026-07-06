import 'package:flutter/material.dart';
import 'package:luxury_tablet/core/theme/theme.dart';

class StoryRenderer extends StatefulWidget {
  final String description;
  final String ingredientStory;
  final String originStory;
  final String chefStory;

  const StoryRenderer({
    super.key,
    required this.description,
    required this.ingredientStory,
    required this.originStory,
    required this.chefStory,
  });

  @override
  State<StoryRenderer> createState() => _StoryRendererState();
}

class _StoryRendererState extends State<StoryRenderer> {
  int _activeTabIndex = 0;

  @override
  Widget build(BuildContext context) {
    final tabs = [
      {
        'title': 'STORY',
        'content': widget.description,
      },
      {
        'title': 'INGREDIENTS',
        'content': widget.ingredientStory.isNotEmpty
            ? widget.ingredientStory
            : 'Our ingredients are carefully selected from local and global boutique producers, curated exclusively for Trump.',
      },
      {
        'title': 'ORIGIN',
        'content': widget.originStory.isNotEmpty
            ? widget.originStory
            : 'This dish traces its heritage back to classic preparations, refined for a modern premium culinary expression.',
      },
      {
        'title': 'PAIRINGS',
        'content': widget.chefStory.isNotEmpty
            ? widget.chefStory
            : 'Designed with the intent to showcase simplicity, texture, and deep flavor contrast by our executive culinary team.',
      },
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Tab Headers Row
        Row(
          children: List.generate(tabs.length, (index) {
            final isActive = index == _activeTabIndex;
            return GestureDetector(
              onTap: () {
                setState(() {
                  _activeTabIndex = index;
                });
              },
              child: Container(
                margin: const EdgeInsets.only(right: 20),
                padding: const EdgeInsets.only(bottom: 6),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: isActive
                          ? LuxuryColors.brushedBronze
                          : Colors.transparent,
                      width: 2.0,
                    ),
                  ),
                ),
                child: Text(
                  tabs[index]['title']!,
                  style: isActive
                      ? LuxuryTypography.tabActive
                      : LuxuryTypography.tab,
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 20),

        // Tab Content Block
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          child: Text(
            tabs[_activeTabIndex]['content']!,
            key: ValueKey<int>(_activeTabIndex),
            style: LuxuryTypography.bodyMedium.copyWith(
              color: LuxuryColors.white.withOpacity(0.85),
              height: 1.7,
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Chef Signature
        Text(
          'Chef Marco',
          style: LuxuryTypography.accentMedium,
        ),
      ],
    );
  }
}
