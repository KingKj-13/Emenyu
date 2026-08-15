import 'package:flutter/material.dart';
import 'package:luxury_tablet/core/utils/media_url.dart';

class ImagePreloader {
  static Future<void> preloadAllImages(BuildContext context, Map<String, dynamic> menuData) async {
    final categories = menuData['categories'] as List<dynamic>? ?? [];

    for (var category in categories) {
      final items = category['items'] as List<dynamic>? ?? [];
      for (var item in items) {
        final heroImage = item['heroImage'] as String?;
        if (heroImage != null && heroImage.isNotEmpty) {
          // Fire and forget preloading
          final provider = heroImage.startsWith('assets/')
              ? AssetImage(heroImage) as ImageProvider
              : NetworkImage(resolveMediaUrl(heroImage)) as ImageProvider;

          if (!context.mounted) continue;
          precacheImage(provider, context).catchError((e) {
            debugPrint("Failed to preload image $heroImage: $e");
          });
        }
      }
    }
    debugPrint("Preloaded all menu images successfully");
  }
}
