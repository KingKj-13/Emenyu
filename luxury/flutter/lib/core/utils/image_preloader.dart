import 'package:flutter/material.dart';

class ImagePreloader {
  static Future<void> preloadAllImages(BuildContext context, Map<String, dynamic> menuData) async {
    final categories = menuData['categories'] as List<dynamic>? ?? [];
    
    for (var category in categories) {
      final items = category['items'] as List<dynamic>? ?? [];
      for (var item in items) {
        final heroImage = item['heroImage'] as String?;
        if (heroImage != null && heroImage.isNotEmpty) {
          // Fire and forget preloading
          final provider = heroImage.startsWith('http') 
              ? NetworkImage(heroImage) as ImageProvider
              : AssetImage(heroImage) as ImageProvider;

          precacheImage(provider, context).catchError((e) {
            debugPrint("Failed to preload image $heroImage: $e");
          });
        }
      }
    }
    debugPrint("Preloaded all menu images successfully");
  }
}
