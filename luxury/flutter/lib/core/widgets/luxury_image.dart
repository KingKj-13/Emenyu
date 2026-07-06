import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:luxury_tablet/core/sync/asset_pipeline.dart';
import 'package:luxury_tablet/core/theme/theme.dart';

class LuxuryImage extends ConsumerWidget {
  final String path;
  final BoxFit fit;
  final double width;
  final double height;

  const LuxuryImage({
    super.key,
    required this.path,
    this.fit = BoxFit.cover,
    this.width = double.infinity,
    this.height = double.infinity,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (path.isEmpty) {
      return Container(color: LuxuryColors.warmDarkBrown, width: width, height: height);
    }

    // Fallback for hardcoded assets in the initial json payload
    if (path.startsWith('assets/')) {
      return Image.asset(
        path,
        fit: fit,
        width: width,
        height: height,
        errorBuilder: (_, __, ___) => Container(color: LuxuryColors.warmDarkBrown),
      );
    }

    final pipeline = ref.watch(assetPipelineProvider);

    return FutureBuilder<String?>(
      future: pipeline.getLocalAssetPath(path),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return Container(color: LuxuryColors.backgroundDarkest, width: width, height: height);
        }

        final localPath = snapshot.data;
        if (localPath != null && localPath.isNotEmpty) {
          return Image.file(
            File(localPath),
            fit: fit,
            width: width,
            height: height,
            errorBuilder: (_, __, ___) => Container(color: LuxuryColors.warmDarkBrown),
          );
        }

        // Fallback to network if not cached locally yet
        if (path.startsWith('http')) {
          return Image.network(
            path,
            fit: fit,
            width: width,
            height: height,
            loadingBuilder: (context, child, loadingProgress) {
              if (loadingProgress == null) return child;
              return Container(
                width: width,
                height: height,
                color: LuxuryColors.backgroundDarkest,
                child: Center(
                  child: CircularProgressIndicator(
                    color: LuxuryColors.champagneGold,
                    value: loadingProgress.expectedTotalBytes != null
                        ? loadingProgress.cumulativeBytesLoaded / (loadingProgress.expectedTotalBytes ?? 1)
                        : null,
                  ),
                ),
              );
            },
            errorBuilder: (_, __, ___) => Container(color: LuxuryColors.warmDarkBrown),
          );
        }

        return Container(color: LuxuryColors.warmDarkBrown, width: width, height: height);
      },
    );
  }
}
