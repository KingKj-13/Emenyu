import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

/// Overridable at build time: --dart-define=WS_BASE_URL=wss://emenyu.com/luxury-api
const String wsBaseUrl = String.fromEnvironment(
  'WS_BASE_URL',
  defaultValue: 'ws://localhost:8000',
);

class WsClient {
  final String wsUrl;
  WebSocketChannel? _channel;
  Function(Map<String, dynamic>)? onEventReceived;

  WsClient({required this.wsUrl});

  void connect(String accessToken, String restaurantId) {
    final uri = Uri.parse('$wsUrl/ws?token=$accessToken&restaurantId=$restaurantId');
    _channel = WebSocketChannel.connect(uri);

    _channel!.stream.listen(
      (message) {
        try {
          final data = jsonDecode(message);
          if (onEventReceived != null) {
            onEventReceived!(data);
          }
        } catch (_) {}
      },
      onError: (_) {
        // Reconnect logic or error callback
      },
      onDone: () {
        // Disconnect logic
      },
    );
  }

  void joinRoom(String room) {
    if (_channel != null) {
      _channel!.sink.add(jsonEncode({
        'event': 'join',
        'data': {'room': room}
      }));
    }
  }

  void disconnect() {
    if (_channel != null) {
      _channel!.sink.close();
      _channel = null;
    }
  }
}
