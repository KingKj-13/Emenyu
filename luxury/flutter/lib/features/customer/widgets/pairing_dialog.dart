import 'package:flutter/material.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/core/widgets/luxury_image.dart';
import 'dart:ui';
import 'dart:math';

class PairingDialog extends StatelessWidget {
  final dynamic baseItem;
  final List<dynamic> categories;

  const PairingDialog({
    super.key,
    required this.baseItem,
    required this.categories,
  });

  dynamic _findPairing() {
    final baseCategory = (baseItem['category'] as String?)?.toLowerCase() ?? '';
    
    String targetCategory = '';
    if (baseCategory == 'steaks') {
      targetCategory = 'wines';
    } else if (baseCategory == 'seafood' || baseCategory == 'starters') {
      targetCategory = 'champagne';
    } else if (baseCategory == 'desserts') {
      targetCategory = 'whisky';
    } else {
      targetCategory = 'steaks'; 
    }

    try {
      final category = categories.firstWhere(
        (c) => (c['id'] as String).toLowerCase() == targetCategory,
      );
      final items = category['items'] as List<dynamic>;
      final random = Random();
      return items[random.nextInt(items.length)];
    } catch (e) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final pairedItem = _findPairing();

    if (pairedItem == null) {
      return AlertDialog(
        backgroundColor: LuxuryColors.charcoalDark,
        title: Text('Sommelier Note', style: LuxuryTypography.displaySmall),
        content: Text('Please consult our sommelier for a bespoke pairing.', style: LuxuryTypography.bodyLarge),
      );
    }

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
      child: Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 40, vertical: 40),
        child: Container(
          width: 800,
          height: 500,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.85),
            borderRadius: BorderRadius.circular(2),
            border: Border.all(
              color: LuxuryColors.brushedBronze.withOpacity(0.5), 
              width: 1.5
            ),
            boxShadow: [
              BoxShadow(
                color: LuxuryColors.brushedBronze.withOpacity(0.15),
                blurRadius: 100,
                spreadRadius: 10,
              )
            ]
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Background Image with Cinematic Fade
              Positioned(
                right: 0,
                top: 0,
                bottom: 0,
                width: 500,
                child: ShaderMask(
                  shaderCallback: (rect) {
                    return const LinearGradient(
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                      colors: [Colors.transparent, Colors.black, Colors.black],
                      stops: [0.0, 0.4, 1.0],
                    ).createShader(rect);
                  },
                  blendMode: BlendMode.dstIn,
                  child: LuxuryImage(
                    path: pairedItem['heroImage'] as String? ?? '',
                    fit: BoxFit.cover,
                  ),
                ),
              ),

              // Content Layout
              Padding(
                padding: const EdgeInsets.all(48.0),
                child: Row(
                  children: [
                    Expanded(
                      flex: 6,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.auto_awesome, color: LuxuryColors.champagneGold, size: 20),
                              const SizedBox(width: 12),
                              Text(
                                'RECOMMENDED PAIRING',
                                style: LuxuryTypography.badge.copyWith(
                                  fontSize: 12,
                                  color: LuxuryColors.champagneGold,
                                  letterSpacing: 3.0,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 32),
                          Text(
                            'To elevate your ${baseItem['name']}, our Head Sommelier highly recommends:',
                            style: LuxuryTypography.bodyMedium.copyWith(
                              color: LuxuryColors.grey,
                              height: 1.5,
                            ),
                          ),
                          const SizedBox(height: 24),
                          Text(
                            (pairedItem['name'] as String).toUpperCase(),
                            style: LuxuryTypography.displayLarge.copyWith(
                              fontSize: 48,
                              letterSpacing: 2.0,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            pairedItem['editorialDescription'] ?? '',
                            style: LuxuryTypography.bodySmall.copyWith(
                              color: LuxuryColors.white.withOpacity(0.8),
                              height: 1.6,
                            ),
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const Spacer(),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                'R ${pairedItem['price']}',
                                style: LuxuryTypography.displayMedium.copyWith(
                                  color: LuxuryColors.champagneGold,
                                  fontSize: 32,
                                ),
                              ),
                              const SizedBox(width: 48),
                              GestureDetector(
                                onTap: () {
                                  Navigator.pop(context);
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text('Added ${pairedItem['name']} to your table request.'),
                                      backgroundColor: LuxuryColors.charcoalDark,
                                    ),
                                  );
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 16),
                                  decoration: BoxDecoration(
                                    color: LuxuryColors.brushedBronze,
                                    boxShadow: [
                                      BoxShadow(
                                        color: LuxuryColors.brushedBronze.withOpacity(0.3),
                                        blurRadius: 15,
                                        offset: const Offset(0, 5),
                                      )
                                    ],
                                  ),
                                  child: Text(
                                    'ADD TO TABLE',
                                    style: LuxuryTypography.buttonPrimary.copyWith(
                                      color: LuxuryColors.backgroundDarkest,
                                      fontWeight: FontWeight.bold,
                                      letterSpacing: 2.0,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      flex: 4,
                      child: Align(
                        alignment: Alignment.topRight,
                        child: GestureDetector(
                          onTap: () => Navigator.pop(context),
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.5),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.close, color: LuxuryColors.white, size: 24),
                          ),
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
    );
  }
}
