import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:luxury_tablet/features/admin/data/admin_repository.dart';

// Dashboard Metrics
final adminDashboardProvider = AsyncNotifierProvider<AdminDashboardNotifier, Map<String, dynamic>>(() {
  return AdminDashboardNotifier();
});

class AdminDashboardNotifier extends AsyncNotifier<Map<String, dynamic>> {
  @override
  Future<Map<String, dynamic>> build() async {
    return _fetch();
  }

  Future<Map<String, dynamic>> _fetch() async {
    final repo = ref.read(adminRepositoryProvider);
    return await repo.fetchDashboardMetrics();
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(() => _fetch());
  }
}

// System Health
final systemHealthProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final repo = ref.read(adminRepositoryProvider);
  return await repo.fetchSystemHealth();
});

// Table Intelligence
final tableIntelligenceProvider = FutureProvider.family<Map<String, dynamic>, String>((ref, tableId) async {
  final repo = ref.read(adminRepositoryProvider);
  return await repo.fetchTableIntelligence(tableId);
});
