import 'package:drift/drift.dart' as drift;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:luxury_tablet/core/networking/api_client.dart';
import 'package:luxury_tablet/core/database/database.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:luxury_tablet/core/websocket/ws_client.dart';
import 'package:luxury_tablet/core/repositories/menu_repository.dart';
import 'package:luxury_tablet/core/sync/asset_pipeline.dart';

final syncEngineProvider = Provider((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final engine = SyncEngine(
    ref: ref,
    apiClient: apiClient,
    wsClient: WsClient(wsUrl: wsBaseUrl),
    assetPipeline: AssetPipeline(apiClient: apiClient),
    db: AppDatabase(),
  );
  engine.initialize();
  return engine;
});

class SyncEngine {
  final Ref ref;
  final ApiClient apiClient;
  final WsClient wsClient;
  final AssetPipeline assetPipeline;
  final AppDatabase db;
  bool _isSyncing = false;

  SyncEngine({
    required this.ref,
    required this.apiClient,
    required this.wsClient,
    required this.assetPipeline,
    required this.db,
  });

  void initialize() {
    // For now, use a placeholder token for WebSocket
    wsClient.onEventReceived = _handleWsEvent;
    wsClient.connect('dummy_token', 'luxury_trump');
    // Ensure we join the menu room to receive content_update signals
    wsClient.joinRoom('menu:luxury_trump');
  }

  void _handleWsEvent(Map<String, dynamic> event) {
    if (event['type'] == 'content_update') {
      final scope = event['scope'];
      if (scope == 'menu' || scope == 'content') {
        syncMenu();
      }
    }
  }

  Future<void> syncMenu() async {
    if (_isSyncing) return;
    _isSyncing = true;

    try {
      final prefs = await SharedPreferences.getInstance();
      final currentVersion = prefs.getInt('menu_version') ?? 0;

      final menuData = await apiClient.getMenu(sinceVersion: currentVersion);

      if (menuData != null) {
        if (menuData['up_to_date'] == true) {
          _isSyncing = false;
          return;
        }

        final int newVersion = menuData['version'] ?? 0;
        final List<dynamic> categories = menuData['categories'] ?? [];

        await db.transaction(() async {
          // Clear old data
          await db.delete(db.menuCategories).go();
          await db.delete(db.menuItems).go();

          for (final catMap in categories) {
            final catId = catMap['id'] as int;
            await db.into(db.menuCategories).insert(MenuCategoriesCompanion.insert(
                  id: drift.Value(catId),
                  name: catMap['title'] ?? '',
                  sortOrder: drift.Value(catMap['sort_order'] ?? 0),
                ));

            final items = catMap['items'] as List<dynamic>? ?? [];
            for (final itemMap in items) {
              await db.into(db.menuItems).insert(MenuItemsCompanion.insert(
                    id: drift.Value(itemMap['id'] as int),
                    categoryId: catId,
                    name: itemMap['name'] ?? '',
                    description: itemMap['description'] ?? '',
                    price: (itemMap['price'] ?? 0).toDouble(),
                    chefPick: drift.Value(itemMap['chef_pick'] ?? false),
                    heroImage: drift.Value(_firstNonEmpty(itemMap['hero_image_path'], itemMap['image_path'])),
                    heroVideo: drift.Value(_firstNonEmpty(itemMap['hero_video_path'], itemMap['video_path'])),
                    ingredientStory: drift.Value(itemMap['ingredient_story'] ?? ''),
                    originStory: drift.Value(itemMap['origin_story'] ?? ''),
                    chefStory: drift.Value(itemMap['chef_story'] ?? ''),
                    sortOrder: drift.Value(itemMap['sort_order'] ?? 0),
                  ));
            }
          }
        });

        await prefs.setInt('menu_version', newVersion);
        
        // Notify Riverpod that the database has changed, forcing UI refresh
        ref.invalidate(menuTreeProvider);
        
        // Trigger asset pipeline sync asynchronously
        assetPipeline.syncAssets().catchError((_) {});
      }
    } finally {
      _isSyncing = false;
    }
  }
}

/// Prefers authored luxury editorial media; falls back to the shared
/// Trump image/video when no luxury-specific content has been authored yet.
String _firstNonEmpty(dynamic primary, dynamic fallback) {
  final p = primary as String?;
  if (p != null && p.isNotEmpty) return p;
  return (fallback as String?) ?? '';
}

