import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/features/waiter/screens/dashboard_screen.dart';
import 'package:luxury_tablet/features/waiter/screens/table_overview_screen.dart';
import 'package:luxury_tablet/features/waiter/screens/waiter_menu_screen.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:luxury_tablet/core/networking/api_client.dart';
import 'package:luxury_tablet/core/websocket/ws_client.dart';
import 'package:luxury_tablet/features/waiter/providers/waiter_providers.dart';

class WaiterApp extends ConsumerStatefulWidget {
  const WaiterApp({super.key});

  @override
  ConsumerState<WaiterApp> createState() => _WaiterAppState();
}

class _WaiterAppState extends ConsumerState<WaiterApp> {
  late WsClient _wsClient;

  @override
  void initState() {
    super.initState();
    // Initialize WebSocket for Waiter
    _wsClient = WsClient(wsUrl: wsBaseUrl);
    _wsClient.connect('waiter_token_stub', 'luxury_trump'); // Hardcoded rid for now
    
    // Listen for updates
    _wsClient.onEventReceived = (data) {
      if (data['type'] == 'cart_update' || data['type'] == 'new_order' || data['type'] == 'kitchen_update') {
        ref.read(tableStatusProvider.notifier).refresh();
        if (data['table_id'] != null) {
          ref.refresh(activeCartProvider(data['table_id']));
          ref.refresh(cartRecommendationsProvider(data['table_id']));
        }
      }
    };
  }

  @override
  void dispose() {
    _wsClient.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'EMenu Waiter POS',
      debugShowCheckedModeBanner: false,
      theme: LuxuryTheme.darkTheme,
      routerConfig: _router,
    );
  }
}

final _router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const DashboardScreen(),
    ),
    GoRoute(
      path: '/table/:id',
      builder: (context, state) {
        final tableId = state.pathParameters['id']!;
        return TableOverviewScreen(tableId: tableId);
      },
    ),
    GoRoute(
      path: '/table/:id/menu',
      builder: (context, state) {
        final tableId = state.pathParameters['id']!;
        return WaiterMenuScreen(tableId: tableId);
      },
    ),
  ],
);
