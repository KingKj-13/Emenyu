import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_cache_manager/flutter_cache_manager.dart';

class LuxuryCacheManager {
  static final LuxuryCacheManager _instance = LuxuryCacheManager._internal();
  factory LuxuryCacheManager() => _instance;
  LuxuryCacheManager._internal();

  final CacheManager _mediaCache = CacheManager(
    Config(
      'luxury_media_cache',
      stalePeriod: const Duration(days: 30),
      maxNrOfCacheObjects: 200,
    ),
  );

  /// Preload a list of media URLs in the background.
  Future<void> preloadAssets(List<String> urls) async {
    if (kIsWeb) return; // Browser handles its own caching
    for (final url in urls) {
      if (url.isNotEmpty) {
        _mediaCache.downloadFile(url).then((_) {}).catchError((_) {});
      }
    }
  }

  /// Get the cached file or download it.
  /// On web, returns null — use network URLs directly.
  Future<dynamic> getCachedFile(String url) async {
    if (kIsWeb || url.isEmpty) return null;
    try {
      final fileInfo = await _mediaCache.getFileFromCache(url);
      if (fileInfo != null) {
        return fileInfo.file;
      }
      final file = await _mediaCache.getSingleFile(url);
      return file;
    } catch (_) {}
    return null;
  }
}
