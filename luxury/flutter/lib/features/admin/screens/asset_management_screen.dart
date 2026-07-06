import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:luxury_tablet/core/theme/theme.dart';

class AssetManagementScreen extends ConsumerWidget {
  const AssetManagementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: LuxuryColors.backgroundDarkest,
      appBar: AppBar(
        backgroundColor: LuxuryColors.backgroundDarkest,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: LuxuryColors.white, size: 18),
          onPressed: () => context.pop(),
        ),
        title: Text('ASSET MANAGEMENT', style: LuxuryTypography.labelLarge),
      ),
      body: Center(
        child: Container(
          padding: const EdgeInsets.all(48),
          decoration: BoxDecoration(
            color: LuxuryColors.cardDark,
            border: Border.all(color: LuxuryColors.brushedBronze),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_sync, color: LuxuryColors.champagneGold, size: 48),
              const SizedBox(height: 24),
              Text('ASSET PIPELINE STATUS', style: LuxuryTypography.displaySmall),
              const SizedBox(height: 32),
              _StatusRow('IMAGE ASSETS', 'SYNCED', Colors.green),
              const SizedBox(height: 16),
              _StatusRow('VIDEO ASSETS', 'PENDING (SPRINT 4)', LuxuryColors.brushedBronze),
              const SizedBox(height: 16),
              _StatusRow('MISSING ASSETS', '0', Colors.green),
              const SizedBox(height: 16),
              _StatusRow('LOCAL CACHE SIZE', '142 MB', LuxuryColors.grey),
            ],
          ),
        ),
      ),
    );
  }

  Widget _StatusRow(String label, String value, Color valueColor) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        SizedBox(width: 200, child: Text(label, style: LuxuryTypography.labelSmall)),
        SizedBox(width: 200, child: Text(value, style: LuxuryTypography.bodyLarge.copyWith(color: valueColor), textAlign: TextAlign.right)),
      ],
    );
  }
}
