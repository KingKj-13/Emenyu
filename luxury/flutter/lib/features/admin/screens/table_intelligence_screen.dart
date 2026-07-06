import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/features/admin/providers/admin_providers.dart';

class TableIntelligenceScreen extends ConsumerWidget {
  final String tableId;

  const TableIntelligenceScreen({super.key, required this.tableId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final intelAsync = ref.watch(tableIntelligenceProvider(tableId));

    return Scaffold(
      backgroundColor: LuxuryColors.backgroundDarkest,
      appBar: AppBar(
        backgroundColor: LuxuryColors.backgroundDarkest,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: LuxuryColors.white, size: 18),
          onPressed: () => context.pop(),
        ),
        title: Text('TABLE INTELLIGENCE - $tableId', style: LuxuryTypography.labelLarge),
      ),
      body: intelAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: LuxuryColors.brushedBronze)),
        error: (e, st) => Center(child: Text('Error: $e', style: const TextStyle(color: Colors.red))),
        data: (data) {
          return Padding(
            padding: const EdgeInsets.all(32.0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Left Column: AI Summary
                Expanded(
                  flex: 1,
                  child: Container(
                    padding: const EdgeInsets.only(right: 32),
                    decoration: const BoxDecoration(
                      border: Border(right: BorderSide(color: LuxuryColors.warmDarkBrown)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('AI SUMMARY', style: LuxuryTypography.displaySmall),
                        const SizedBox(height: 16),
                        Text(data['ai_summary'], style: LuxuryTypography.bodyLarge.copyWith(fontStyle: FontStyle.italic)),
                        const SizedBox(height: 32),
                        _InfoRow('OCCASION', data['occasion_detection']),
                        _InfoRow('SPENDING SCORE', '${data['premium_spending_score']}/100'),
                        const SizedBox(height: 32),
                        Container(
                          padding: const EdgeInsets.all(16),
                          color: LuxuryColors.brushedBronze.withOpacity(0.1),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('BEST NEXT ACTION', style: LuxuryTypography.labelSmall.copyWith(color: LuxuryColors.champagneGold)),
                              const SizedBox(height: 8),
                              Text(data['best_next_action'], style: LuxuryTypography.bodyLarge),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                // Right Column: Analytics & Timeline
                Expanded(
                  flex: 1,
                  child: Padding(
                    padding: const EdgeInsets.only(left: 32.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('RECOMMENDATION ANALYTICS', style: LuxuryTypography.displaySmall),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            _StatBox('ACCEPTED', data['accepted_recommendations'].toString(), LuxuryColors.brushedBronze),
                            const SizedBox(width: 16),
                            _StatBox('DECLINED', data['declined_recommendations'].toString(), LuxuryColors.warmDarkBrown),
                          ],
                        ),
                        const SizedBox(height: 48),
                        Text('SESSION TIMELINE', style: LuxuryTypography.displaySmall),
                        const SizedBox(height: 16),
                        Expanded(
                          child: Container(
                            decoration: BoxDecoration(
                              color: LuxuryColors.cardDark,
                              border: Border.all(color: LuxuryColors.warmDarkBrown),
                            ),
                            child: ListView.builder(
                              itemCount: (data['timeline'] as List).length,
                              itemBuilder: (context, index) {
                                final event = data['timeline'][index];
                                return ListTile(
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                                  leading: const Icon(Icons.circle, size: 12, color: LuxuryColors.champagneGold),
                                  title: Text(event['state'] ?? 'UNKNOWN', style: LuxuryTypography.bodyMedium.copyWith(color: LuxuryColors.champagneGold)),
                                  subtitle: Text(event['entered_at'] ?? '', style: LuxuryTypography.bodySmall.copyWith(color: LuxuryColors.grey)),
                                );
                              },
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _InfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: LuxuryTypography.labelSmall.copyWith(color: LuxuryColors.grey)),
          const SizedBox(height: 4),
          Text(value, style: LuxuryTypography.bodyLarge),
        ],
      ),
    );
  }
}

class _StatBox extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatBox(this.label, this.value, this.color);

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(border: Border.all(color: color)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: LuxuryTypography.labelSmall.copyWith(color: color)),
            const SizedBox(height: 8),
            Text(value, style: LuxuryTypography.displayMedium),
          ],
        ),
      ),
    );
  }
}
