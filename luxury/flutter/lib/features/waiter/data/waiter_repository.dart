import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:luxury_tablet/core/networking/api_client.dart';

final waiterRepositoryProvider = Provider<WaiterRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return WaiterRepository(apiClient);
});

class WaiterRepository {
  final ApiClient _api;

  WaiterRepository(this._api);

  Future<List<dynamic>> fetchTableStatuses() async {
    final res = await _api.get('/tables/status');
    return res.data['tables'] as List<dynamic>;
  }

  Future<void> updateCart(String tableId, List<dynamic> items) async {
    await _api.post('/orders/cart/update', data: {
      'table_id': tableId,
      'cart': items,
    });
  }

  Future<List<dynamic>> fetchCart(String tableId) async {
    final res = await _api.get('/orders/cart/$tableId');
    return res.data['cart']?['items'] ?? [];
  }

  Future<String> submitOrder(String tableId, String waiterName, List<dynamic> items) async {
    final res = await _api.post('/orders/', data: {
      'table_id': tableId,
      'waiter_name': waiterName,
      'items': items,
    });
    return res.data['order_id'].toString();
  }

  Future<void> updateKitchenStatus(String orderId, String status) async {
    await _api.post('/orders/$orderId/kitchen-status', queryParameters: {
      'status': status,
    });
  }

  Future<Map<String, dynamic>> fetchRecommendations(String tableId, List<dynamic> cart) async {
    try {
      final res = await _api.post('/brain/cart-recommendations', data: {
        'table_id': tableId,
        'cart': cart,
      });
      return res.data;
    } catch (_) {
      return {};
    }
  }

  Future<void> startDiningSession(String tableId, int covers, String waiterName) async {
    await _api.post('/dining/sessions', data: {
      'table_id': tableId,
      'covers': covers,
      'waiter_name': waiterName,
    });
  }

  Future<void> advanceDiningState(int sessionId, String targetState) async {
    await _api.post('/dining/sessions/$sessionId/transition', data: {
      'target_state': targetState,
    });
  }

  Future<void> endDiningSession(int sessionId) async {
    await _api.post('/dining/sessions/$sessionId/finish');
  }
}
