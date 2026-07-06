import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/core/websocket/ws_client.dart';
import 'package:luxury_tablet/features/admin/screens/admin_dashboard_screen.dart';
import 'package:luxury_tablet/features/admin/screens/admin_floor_screen.dart';
import 'package:luxury_tablet/features/admin/screens/table_intelligence_screen.dart';
import 'package:luxury_tablet/features/admin/screens/content_management_screen.dart';
import 'package:luxury_tablet/features/admin/screens/asset_management_screen.dart';
import 'package:luxury_tablet/features/admin/providers/admin_providers.dart';

class AdminApp extends ConsumerStatefulWidget {
  const AdminApp({super.key});

  @override
  ConsumerState<AdminApp> createState() => _AdminAppState();
}

class _AdminAppState extends ConsumerState<AdminApp> {
  late WsClient _wsClient;

  @override
  void initState() {
    super.initState();
    _wsClient = WsClient(wsUrl: wsBaseUrl);
    _wsClient.connect('admin_token', 'luxury_trump');
    
    _wsClient.onEventReceived = (data) {
      if (data['type'] == 'demo_update' || data['type'] == 'new_order' || data['type'] == 'cart_update') {
        ref.read(adminDashboardProvider.notifier).refresh();
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
      title: 'EMenu Luxury Admin',
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
      builder: (context, state) => const AdminDashboardScreen(),
    ),
    GoRoute(
      path: '/floor',
      builder: (context, state) => const AdminFloorScreen(),
    ),
    GoRoute(
      path: '/table/:id',
      builder: (context, state) {
        final tableId = state.pathParameters['id']!;
        return TableIntelligenceScreen(tableId: tableId);
      },
    ),
    GoRoute(
      path: '/content',
      builder: (context, state) => const ContentManagementScreen(),
    ),
    GoRoute(
      path: '/assets',
      builder: (context, state) => const AssetManagementScreen(),
    ),
  ],
);
