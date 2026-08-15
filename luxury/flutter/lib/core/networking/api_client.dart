import 'dart:convert';
import 'dart:isolate';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Overridable at build time: --dart-define=API_BASE_URL=https://emenyu.com/luxury-api/api/v1
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:8000/api/v1',
);

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(baseUrl: apiBaseUrl, restaurantId: 'luxury_trump');
});

/// Minimal Dio-shaped response wrapper so repositories can read `res.data`.
class ApiResponse {
  final dynamic data;
  ApiResponse(this.data);
}

class ApiClient {
  final String baseUrl;
  final String restaurantId;
  String? _accessToken;
  String? _deviceId;

  ApiClient({
    required this.baseUrl,
    required this.restaurantId,
  });

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _accessToken = prefs.getString('access_token');
    _deviceId = prefs.getString('device_id');
  }

  bool get isAuthenticated => _accessToken != null;

  Future<bool> registerDevice(String deviceName) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/device/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'device_name': deviceName,
          'platform': 'android',
          'app_type': 'customer_tablet',
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        _accessToken = data['access_token'];
        _deviceId = data['device_id'];

        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('access_token', _accessToken!);
        await prefs.setString('device_id', _deviceId!);
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<Map<String, dynamic>?> getMenu({int sinceVersion = 0}) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/menu?restaurantId=$restaurantId&since_version=$sinceVersion'),
        headers: {
          'Authorization': 'Bearer $_accessToken',
        },
      );

      if (response.statusCode == 200) {
        final bodyString = response.body;
        return await Isolate.run(() => jsonDecode(bodyString) as Map<String, dynamic>);
      }
    } catch (_) {}
    return null;
  }

  Future<Map<String, dynamic>?> syncManifest(int sinceVersion) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/content/sync/manifest?since_version=$sinceVersion'),
        headers: {
          'Authorization': 'Bearer $_accessToken',
        },
      );

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (_) {}
    return null;
  }

  Map<String, String> get _authHeaders => {
        'Content-Type': 'application/json',
        if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
      };

  Uri _uri(String path, [Map<String, dynamic>? queryParameters]) {
    final uri = Uri.parse('$baseUrl$path');
    if (queryParameters == null || queryParameters.isEmpty) return uri;
    return uri.replace(
      queryParameters: queryParameters.map((key, value) => MapEntry(key, value.toString())),
    );
  }

  dynamic _decode(http.Response response) => response.body.isEmpty ? null : jsonDecode(response.body);

  Future<ApiResponse> get(String path, {Map<String, dynamic>? queryParameters}) async {
    final response = await http.get(_uri(path, queryParameters), headers: _authHeaders);
    return ApiResponse(_decode(response));
  }

  Future<ApiResponse> post(String path, {Object? data, Map<String, dynamic>? queryParameters}) async {
    final response = await http.post(
      _uri(path, queryParameters),
      headers: _authHeaders,
      body: data != null ? jsonEncode(data) : null,
    );
    return ApiResponse(_decode(response));
  }

  Future<ApiResponse> put(String path, {Object? data}) async {
    final response = await http.put(_uri(path), headers: _authHeaders, body: data != null ? jsonEncode(data) : null);
    return ApiResponse(_decode(response));
  }
}
