import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/features/admin/providers/admin_providers.dart';
import 'package:luxury_tablet/features/admin/data/admin_repository.dart';

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboardAsync = ref.watch(adminDashboardProvider);

    return Scaffold(
      backgroundColor: LuxuryColors.backgroundDarkest,
      appBar: AppBar(
        backgroundColor: LuxuryColors.backgroundDarkest,
        title: Text('EMENU ADMIN DASHBOARD', style: LuxuryTypography.displaySmall.copyWith(letterSpacing: 2)),
        actions: [
          ElevatedButton.icon(
            icon: const Icon(Icons.play_arrow, color: LuxuryColors.backgroundDarkest),
            label: Text('RUN DEMO', style: LuxuryTypography.buttonPrimary.copyWith(color: LuxuryColors.backgroundDarkest)),
            style: ElevatedButton.styleFrom(backgroundColor: LuxuryColors.brushedBronze),
            onPressed: () async {
              await ref.read(adminRepositoryProvider).triggerDemoSimulation();
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Demo simulated successfully. DB populated.')));
            },
          ),
          const SizedBox(width: 20),
          IconButton(
            icon: const Icon(Icons.fastfood, color: LuxuryColors.brushedBronze),
            tooltip: 'Content Management',
            onPressed: () => context.go('/content'),
          ),
          IconButton(
            icon: const Icon(Icons.cloud_sync, color: LuxuryColors.brushedBronze),
            tooltip: 'Asset Management',
            onPressed: () => context.go('/assets'),
          ),
          IconButton(
            icon: const Icon(Icons.table_bar, color: LuxuryColors.brushedBronze),
            tooltip: 'Restaurant Floor',
            onPressed: () => context.go('/floor'),
          ),
          const SizedBox(width: 20),
        ],
      ),
      body: dashboardAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: LuxuryColors.brushedBronze)),
        error: (err, st) => Center(child: Text('Error: $err', style: const TextStyle(color: Colors.red))),
        data: (data) {
          return Padding(
            padding: const EdgeInsets.all(32.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('LIVE PERFORMANCE', style: LuxuryTypography.labelLarge.copyWith(color: LuxuryColors.champagneGold)),
                const SizedBox(height: 32),
                Row(
                  children: [
                    Expanded(child: _MetricCard(title: 'LIVE REVENUE', value: 'R ${data['live_revenue']}')),
                    const SizedBox(width: 24),
                    Expanded(child: _MetricCard(title: 'AI GENERATED', value: 'R ${data['ai_generated_revenue']}')),
                    const SizedBox(width: 24),
                    Expanded(child: _MetricCard(title: 'ACCEPTANCE RATE', value: '${(data['recommendation_acceptance_rate'] * 100).toStringAsFixed(1)}%')),
                    const SizedBox(width: 24),
                    Expanded(child: _MetricCard(title: 'AVERAGE SPEND', value: 'R ${data['average_spend'].toStringAsFixed(0)}')),
                  ],
                ),
                const SizedBox(height: 48),
                Text('FLOOR OPERATIONS', style: LuxuryTypography.labelLarge.copyWith(color: LuxuryColors.champagneGold)),
                const SizedBox(height: 32),
                Row(
                  children: [
                    Expanded(child: _MetricCard(title: 'ACTIVE SESSIONS', value: data['current_dining_sessions'].toString())),
                    const SizedBox(width: 24),
                    Expanded(child: _MetricCard(title: 'AVAILABLE TABLES', value: data['available_tables'].toString())),
                    const SizedBox(width: 24),
                    Expanded(child: _MetricCard(title: 'OCCUPANCY RATE', value: '${(data['occupancy_rate'] * 100).toStringAsFixed(1)}%')),
                    const SizedBox(width: 24),
                    const Expanded(child: _HealthWidget()), // Replace with health
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String title;
  final String value;

  const _MetricCard({required this.title, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: LuxuryColors.cardDark,
        border: Border.all(color: LuxuryColors.warmDarkBrown),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: LuxuryTypography.labelSmall.copyWith(color: LuxuryColors.grey)),
          const SizedBox(height: 16),
          Text(value, style: LuxuryTypography.displayMedium.copyWith(color: LuxuryColors.white)),
        ],
      ),
    );
  }
}

class _HealthWidget extends ConsumerWidget {
  const _HealthWidget();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final healthAsync = ref.watch(systemHealthProvider);

    return healthAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, st) => Text('Health Error'),
      data: (health) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: LuxuryColors.cardDark,
          border: Border.all(color: LuxuryColors.brushedBronze),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('SYSTEM HEALTH', style: LuxuryTypography.labelSmall.copyWith(color: LuxuryColors.brushedBronze)),
            const SizedBox(height: 12),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('Backend', style: LuxuryTypography.bodySmall),
              Text(health['backend'], style: LuxuryTypography.bodySmall.copyWith(color: Colors.green)),
            ]),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('WebSocket', style: LuxuryTypography.bodySmall),
              Text(health['websocket'], style: LuxuryTypography.bodySmall.copyWith(color: Colors.green)),
            ]),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('Tablets Online', style: LuxuryTypography.bodySmall),
              Text('${health['connected_customers']} C / ${health['connected_waiters']} W', style: LuxuryTypography.bodySmall),
            ]),
          ],
        ),
      ),
    );
  }
}
