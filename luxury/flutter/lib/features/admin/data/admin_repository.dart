import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:luxury_tablet/core/networking/api_client.dart';

final adminRepositoryProvider = Provider<AdminRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return AdminRepository(apiClient);
});

class AdminRepository {
  final ApiClient _api;

  AdminRepository(this._api);

  Future<Map<String, dynamic>> fetchDashboardMetrics() async {
    final res = await _api.get('/admin/dashboard');
    return res.data;
  }

  Future<Map<String, dynamic>> fetchSystemHealth() async {
    final res = await _api.get('/admin/health');
    return res.data;
  }

  Future<Map<String, dynamic>> fetchTableIntelligence(String tableId) async {
    final res = await _api.get('/admin/analytics/tables/$tableId');
    return res.data;
  }

  Future<void> triggerDemoSimulation() async {
    await _api.post('/demo/simulate');
  }

  Future<Map<String, dynamic>> fetchMenuTree() async {
    final res = await _api.get('/menu');
    return res.data;
  }

  Future<void> updateMenuItem(int itemId, Map<String, dynamic> data) async {
    await _api.put('/admin/menu/items/$itemId', data: data);
  }
}
