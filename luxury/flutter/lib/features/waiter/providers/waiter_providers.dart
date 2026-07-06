import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:luxury_tablet/features/waiter/data/waiter_repository.dart';

final tableStatusProvider = AsyncNotifierProvider<TableStatusNotifier, List<dynamic>>(() {
  return TableStatusNotifier();
});

class TableStatusNotifier extends AsyncNotifier<List<dynamic>> {
  @override
  Future<List<dynamic>> build() async {
    return _fetch();
  }

  Future<List<dynamic>> _fetch() async {
    final repo = ref.read(waiterRepositoryProvider);
    return await repo.fetchTableStatuses();
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetch());
  }
}

// Active Table state
final activeTableIdProvider = StateProvider<String?>((ref) => null);

// Cart for active table
final activeCartProvider = AsyncNotifierProviderFamily<CartNotifier, List<dynamic>, String>(() {
  return CartNotifier();
});

class CartNotifier extends FamilyAsyncNotifier<List<dynamic>, String> {
  @override
  Future<List<dynamic>> build(String arg) async {
    final repo = ref.read(waiterRepositoryProvider);
    return await repo.fetchCart(arg);
  }

  Future<void> addItem(Map<String, dynamic> item) async {
    final current = state.value ?? [];
    final updated = List<dynamic>.from(current)..add(item);
    
    state = AsyncValue.data(updated);
    await ref.read(waiterRepositoryProvider).updateCart(arg, updated);
  }

  Future<void> removeItem(int index) async {
    final current = state.value ?? [];
    if (index >= 0 && index < current.length) {
      final updated = List<dynamic>.from(current)..removeAt(index);
      state = AsyncValue.data(updated);
      await ref.read(waiterRepositoryProvider).updateCart(arg, updated);
    }
  }

  Future<void> submitOrder(String waiterName) async {
    final current = state.value ?? [];
    if (current.isEmpty) return;

    await ref.read(waiterRepositoryProvider).submitOrder(arg, waiterName, current);
    state = const AsyncValue.data([]);
  }
}

// Recommendation Provider
final cartRecommendationsProvider = FutureProvider.family<Map<String, dynamic>, String>((ref, tableId) async {
  final cart = ref.watch(activeCartProvider(tableId)).value ?? [];
  if (cart.isEmpty) return {};
  
  final repo = ref.read(waiterRepositoryProvider);
  return await repo.fetchRecommendations(tableId, cart);
});
