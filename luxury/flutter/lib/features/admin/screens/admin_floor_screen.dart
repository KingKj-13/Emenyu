import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/features/waiter/providers/waiter_providers.dart'; // Reuse table provider!

class AdminFloorScreen extends ConsumerWidget {
  const AdminFloorScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // We can reuse the Waiter's tableStatusProvider for the floor layout since it contains what we need!
    final tablesAsync = ref.watch(tableStatusProvider);

    return Scaffold(
      backgroundColor: LuxuryColors.backgroundDarkest,
      appBar: AppBar(
        backgroundColor: LuxuryColors.backgroundDarkest,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: LuxuryColors.white, size: 18),
          onPressed: () => context.go('/'),
        ),
        title: Text('RESTAURANT FLOOR - ADMIN', style: LuxuryTypography.labelLarge),
      ),
      body: tablesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: LuxuryColors.brushedBronze)),
        error: (err, st) => Center(child: Text('Error: $err', style: TextStyle(color: Colors.red))),
        data: (tables) {
          if (tables.isEmpty) return const Center(child: Text('No tables.'));

          return GridView.builder(
            padding: const EdgeInsets.all(32),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 4,
              childAspectRatio: 1.5,
              crossAxisSpacing: 24,
              mainAxisSpacing: 24,
            ),
            itemCount: tables.length,
            itemBuilder: (context, index) {
              final table = tables[index];
              return _AdminTableCard(
                tableId: table['table_id'],
                state: table['state'] ?? 'EMPTY',
                covers: table['covers'] ?? 0,
                onTap: () => context.go('/table/${table['table_id']}'),
              );
            },
          );
        },
      ),
    );
  }
}

class _AdminTableCard extends StatelessWidget {
  final String tableId;
  final String state;
  final int covers;
  final VoidCallback onTap;

  const _AdminTableCard({required this.tableId, required this.state, required this.covers, required this.onTap});

  @override
  Widget build(BuildContext context) {
    Color borderColor = state == 'EMPTY' ? LuxuryColors.warmDarkBrown : LuxuryColors.champagneGold;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: LuxuryColors.cardDark,
          border: Border.all(color: borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(tableId, style: LuxuryTypography.displaySmall),
                Text(state, style: LuxuryTypography.labelSmall.copyWith(color: borderColor)),
              ],
            ),
            const Spacer(),
            if (covers > 0) Text('COVERS: $covers', style: LuxuryTypography.bodySmall),
            const SizedBox(height: 4),
            Text('VIEW INTELLIGENCE ->', style: LuxuryTypography.labelSmall.copyWith(color: LuxuryColors.brushedBronze)),
          ],
        ),
      ),
    );
  }
}
