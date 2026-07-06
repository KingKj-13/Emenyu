import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/features/waiter/providers/waiter_providers.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tablesAsync = ref.watch(tableStatusProvider);

    return Scaffold(
      backgroundColor: LuxuryColors.backgroundDarkest,
      appBar: AppBar(
        backgroundColor: LuxuryColors.backgroundDarkest,
        elevation: 0,
        title: Text(
          'RESTAURANT FLOOR',
          style: LuxuryTypography.displaySmall.copyWith(fontSize: 24, letterSpacing: 2.0),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: LuxuryColors.brushedBronze),
            onPressed: () => ref.read(tableStatusProvider.notifier).refresh(),
          ),
          const SizedBox(width: 20),
        ],
      ),
      body: tablesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: LuxuryColors.brushedBronze)),
        error: (err, stack) => Center(child: Text('Error loading tables: $err', style: TextStyle(color: Colors.red))),
        data: (tables) {
          if (tables.isEmpty) {
            return const Center(child: Text('No tables found.', style: TextStyle(color: Colors.white)));
          }

          return Padding(
            padding: const EdgeInsets.all(24.0),
            child: GridView.builder(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 4,
                childAspectRatio: 1.3,
                crossAxisSpacing: 24,
                mainAxisSpacing: 24,
              ),
              itemCount: tables.length,
              itemBuilder: (context, index) {
                final table = tables[index];
                final state = table['state'] as String? ?? 'EMPTY';
                final name = table['display_name'] as String? ?? 'Table';
                final tableId = table['table_id'] as String;
                final covers = table['covers'] as int? ?? 0;
                
                return _TableCard(
                  name: name,
                  state: state,
                  covers: covers,
                  onTap: () {
                    ref.read(activeTableIdProvider.notifier).state = tableId;
                    context.go('/table/$tableId');
                  },
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _TableCard extends StatelessWidget {
  final String name;
  final String state;
  final int covers;
  final VoidCallback onTap;

  const _TableCard({
    required this.name,
    required this.state,
    required this.covers,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    Color borderColor = LuxuryColors.warmDarkBrown;
    Color statusColor = LuxuryColors.grey;

    if (state == 'WELCOME' || state == 'SEATED') {
      borderColor = LuxuryColors.champagneGold;
      statusColor = LuxuryColors.champagneGold;
    } else if (state == 'FINISHED' || state == 'EMPTY') {
      borderColor = LuxuryColors.warmDarkBrown;
      statusColor = LuxuryColors.grey;
    } else {
      borderColor = LuxuryColors.brushedBronze;
      statusColor = LuxuryColors.brushedBronze;
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: LuxuryColors.cardDark,
          border: Border.all(color: borderColor, width: 1.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  name.toUpperCase(),
                  style: LuxuryTypography.displaySmall.copyWith(fontSize: 22),
                ),
                if (covers > 0)
                  Row(
                    children: [
                      const Icon(Icons.person, color: LuxuryColors.grey, size: 16),
                      const SizedBox(width: 4),
                      Text(covers.toString(), style: LuxuryTypography.bodyMedium),
                    ],
                  ),
              ],
            ),
            const Spacer(),
            Text(
              state.toUpperCase(),
              style: LuxuryTypography.labelMedium.copyWith(color: statusColor),
            ),
          ],
        ),
      ),
    );
  }
}
