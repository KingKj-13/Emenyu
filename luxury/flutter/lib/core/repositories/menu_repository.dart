import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:luxury_tablet/core/database/database.dart';
import 'package:luxury_tablet/core/sync/sync_engine.dart';

final menuRepositoryProvider = Provider((ref) => MenuRepository(ref.watch(syncEngineProvider).db));

final menuTreeProvider = FutureProvider<List<dynamic>>((ref) async {
  final repo = ref.watch(menuRepositoryProvider);
  // Trigger a background sync without awaiting
  ref.read(syncEngineProvider).syncMenu().catchError((_) {});
  
  // Return current local state
  return await repo.getMenuTree();
});

class MenuRepository {
  final AppDatabase db;

  MenuRepository(this.db);

  Future<List<dynamic>> getMenuTree() async {
    final categories = await db.select(db.menuCategories).get();
    final items = await db.select(db.menuItems).get();

    final List<Map<String, dynamic>> result = [];
    for (final cat in categories) {
      final catItems = items.where((i) => i.categoryId == cat.id).map((i) => {
            'id': i.id,
            'name': i.name,
            'description': i.description,
            'price': i.price,
            'origin': {
              'region': i.originRegion,
              'country': i.originCountry,
            },
            'chefPick': i.chefPick,
            'heroImage': i.heroImage,
            'heroVideo': i.heroVideo,
            'ingredientStory': i.ingredientStory,
            'originStory': i.originStory,
            'chefStory': i.chefStory,
            'sort_order': i.sortOrder,
          }).toList();
      
      // Sort items inside category
      catItems.sort((a, b) => (a['sort_order'] as int).compareTo(b['sort_order'] as int));

      result.add({
        'id': cat.id,
        'name': cat.name,
        'sort_order': cat.sortOrder,
        'items': catItems,
      });
    }

    // Sort categories
    result.sort((a, b) => (a['sort_order'] as int).compareTo(b['sort_order'] as int));

    return result;
  }
}
