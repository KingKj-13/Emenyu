import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/features/waiter/data/waiter_repository.dart';
import 'package:luxury_tablet/features/waiter/providers/waiter_providers.dart';

class TableOverviewScreen extends ConsumerWidget {
  final String tableId;

  const TableOverviewScreen({super.key, required this.tableId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tablesAsync = ref.watch(tableStatusProvider);
    final tableData = tablesAsync.value?.firstWhere((t) => t['table_id'] == tableId, orElse: () => null);

    final String state = tableData?['state'] ?? 'EMPTY';
    final int sessionId = tableData?['session']?['id'] ?? 0;

    return Scaffold(
      backgroundColor: LuxuryColors.backgroundDarkest,
      appBar: AppBar(
        backgroundColor: LuxuryColors.backgroundDarkest,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: LuxuryColors.white, size: 18),
          onPressed: () => context.go('/'),
        ),
        title: Text(
          'TABLE OVERVIEW - $tableId',
          style: LuxuryTypography.labelLarge,
        ),
      ),
      body: Row(
        children: [
          // Left Side: Session controls & Current State
          Expanded(
            flex: 1,
            child: Container(
              padding: const EdgeInsets.all(32),
              decoration: const BoxDecoration(
                border: Border(right: BorderSide(color: LuxuryColors.warmDarkBrown, width: 1)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('DINING STATE', style: LuxuryTypography.labelSmall),
                  const SizedBox(height: 8),
                  Text(state, style: LuxuryTypography.displayMedium.copyWith(color: LuxuryColors.brushedBronze)),
                  const SizedBox(height: 48),

                  if (state == 'EMPTY' || state == 'FINISHED')
                    _buildActionButton(
                      'SEAT TABLE',
                      () async {
                        await ref.read(waiterRepositoryProvider).startDiningSession(tableId, 2, 'AI Assistant');
                        ref.read(tableStatusProvider.notifier).refresh();
                      },
                    )
                  else ...[
                    _buildActionButton(
                      'ADVANCE TO STARTERS',
                      () async {
                        await ref.read(waiterRepositoryProvider).advanceDiningState(sessionId, 'STARTERS');
                        ref.read(tableStatusProvider.notifier).refresh();
                      },
                    ),
                    const SizedBox(height: 16),
                    _buildActionButton(
                      'ADVANCE TO MAINS',
                      () async {
                        await ref.read(waiterRepositoryProvider).advanceDiningState(sessionId, 'MAINS');
                        ref.read(tableStatusProvider.notifier).refresh();
                      },
                    ),
                    const SizedBox(height: 16),
                    _buildActionButton(
                      'FINISH MEAL',
                      () async {
                        await ref.read(waiterRepositoryProvider).endDiningSession(sessionId);
                        ref.read(tableStatusProvider.notifier).refresh();
                      },
                    ),
                  ],
                ],
              ),
            ),
          ),
          
          // Middle: Active Cart / Orders
          Expanded(
            flex: 2,
            child: Container(
              decoration: const BoxDecoration(
                border: Border(right: BorderSide(color: LuxuryColors.warmDarkBrown, width: 1)),
              ),
              child: _ActiveCartPanel(tableId: tableId),
            ),
          ),

          // Right Side: Recommendations
          Expanded(
            flex: 2,
            child: _RecommendationPanel(tableId: tableId),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton(String text, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          border: Border.all(color: LuxuryColors.brushedBronze),
        ),
        alignment: Alignment.center,
        child: Text(text, style: LuxuryTypography.buttonPrimary),
      ),
    );
  }
}

class _ActiveCartPanel extends ConsumerWidget {
  final String tableId;

  const _ActiveCartPanel({required this.tableId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartAsync = ref.watch(activeCartProvider(tableId));
    
    return Padding(
      padding: const EdgeInsets.all(32.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('ACTIVE ORDER', style: LuxuryTypography.displaySmall),
              ElevatedButton.icon(
                icon: const Icon(Icons.add, color: LuxuryColors.backgroundDarkest),
                label: Text('ADD ITEMS', style: LuxuryTypography.buttonPrimary.copyWith(color: LuxuryColors.backgroundDarkest)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: LuxuryColors.brushedBronze,
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                ),
                onPressed: () {
                  context.push('/table/$tableId/menu');
                },
              ),
            ],
          ),
          const SizedBox(height: 32),
          Expanded(
            child: cartAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, st) => Text('Error: $err'),
              data: (cart) {
                if (cart.isEmpty) {
                  return const Center(
                    child: Text('Cart is empty. Tap ADD ITEMS to begin taking order.', style: TextStyle(color: Colors.grey)),
                  );
                }
                
                return ListView.builder(
                  itemCount: cart.length,
                  itemBuilder: (context, index) {
                    final item = cart[index];
                    return ListTile(
                      title: Text(item['name'], style: LuxuryTypography.bodyLarge),
                      subtitle: Text(item['note'] ?? '', style: LuxuryTypography.bodySmall),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('R ${item['price']}', style: LuxuryTypography.priceSmall),
                          const SizedBox(width: 16),
                          IconButton(
                            icon: const Icon(Icons.remove_circle_outline, color: LuxuryColors.grey),
                            onPressed: () {
                              ref.read(activeCartProvider(tableId).notifier).removeItem(index);
                            },
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
          const SizedBox(height: 16),
          // Submit Order
          _buildButton('SEND TO KITCHEN', () async {
            await ref.read(activeCartProvider(tableId).notifier).submitOrder("AI Waiter");
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Order sent to kitchen!')));
          }),
        ],
      ),
    );
  }

  Widget _buildButton(String text, VoidCallback onTap, {bool isSecondary = false}) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 20),
        decoration: BoxDecoration(
          color: isSecondary ? Colors.transparent : LuxuryColors.brushedBronze,
          border: Border.all(color: LuxuryColors.brushedBronze),
        ),
        alignment: Alignment.center,
        child: Text(
          text,
          style: LuxuryTypography.buttonPrimary.copyWith(
            color: isSecondary ? LuxuryColors.brushedBronze : LuxuryColors.backgroundDarkest,
          ),
        ),
      ),
    );
  }
}

class _RecommendationPanel extends ConsumerWidget {
  final String tableId;

  const _RecommendationPanel({required this.tableId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recsAsync = ref.watch(cartRecommendationsProvider(tableId));

    return Padding(
      padding: const EdgeInsets.all(32.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('AI OPPORTUNITIES', style: LuxuryTypography.displaySmall),
          const SizedBox(height: 32),
          Expanded(
            child: recsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: LuxuryColors.brushedBronze)),
              error: (err, st) => Text('Error loading AI data: $err'),
              data: (data) {
                final recs = data['recommendations'] as List<dynamic>? ?? [];
                
                if (recs.isEmpty) {
                  return const Center(child: Text('No AI recommendations available for the current cart.', style: TextStyle(color: Colors.grey)));
                }

                return ListView.builder(
                  itemCount: recs.length,
                  itemBuilder: (context, index) {
                    final itemRec = recs[index];
                    final source = itemRec['source_item'];
                    
                    final pairing = itemRec['pairing'];
                    final upgrade = itemRec['upgrade'];

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (source != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 16.0),
                            child: Text('FOR: ${source['name']}', style: LuxuryTypography.labelSmall),
                          ),
                        if (pairing != null) _buildRecCard('PAIRING', pairing),
                        if (upgrade != null) _buildRecCard('UPGRADE', upgrade),
                        const SizedBox(height: 32),
                      ],
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecCard(String type, Map<String, dynamic> data) {
    final item = data['item'];
    final scripts = data['scripts'];
    if (item == null) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: LuxuryColors.cardDark,
        border: Border.all(color: LuxuryColors.brushedBronze),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(type, style: LuxuryTypography.labelSmall.copyWith(color: LuxuryColors.champagneGold)),
              Row(
                children: [
                  Text('EV: R ${data['expected_value']}', style: LuxuryTypography.labelSmall),
                  const SizedBox(width: 8),
                  Text('CONF: ${(data['confidence'] * 100).toStringAsFixed(0)}%', style: LuxuryTypography.labelSmall),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(item['name'], style: LuxuryTypography.bodyLarge.copyWith(color: LuxuryColors.white)),
          const SizedBox(height: 8),
          Text(data['explanation'] ?? '', style: LuxuryTypography.bodySmall.copyWith(color: LuxuryColors.grey)),
          const SizedBox(height: 16),
          if (scripts != null) ...[
            Text('SCRIPTS:', style: LuxuryTypography.labelSmall),
            const SizedBox(height: 8),
            _ScriptTab(scripts: scripts),
          ],
        ],
      ),
    );
  }
}

class _ScriptTab extends StatefulWidget {
  final Map<String, dynamic> scripts;
  const _ScriptTab({required this.scripts});

  @override
  State<_ScriptTab> createState() => _ScriptTabState();
}

class _ScriptTabState extends State<_ScriptTab> {
  String _selected = 'luxury';

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            _tab('LUXURY', 'luxury'),
            const SizedBox(width: 8),
            _tab('PROFESSIONAL', 'professional'),
            const SizedBox(width: 8),
            _tab('FRIENDLY', 'friendly'),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          color: Colors.black26,
          child: Text(
            widget.scripts[_selected] ?? '',
            style: LuxuryTypography.bodyMedium.copyWith(fontStyle: FontStyle.italic),
          ),
        ),
      ],
    );
  }

  Widget _tab(String label, String key) {
    final isSelected = _selected == key;
    return GestureDetector(
      onTap: () => setState(() => _selected = key),
      child: Text(
        label,
        style: LuxuryTypography.labelSmall.copyWith(
          color: isSelected ? LuxuryColors.brushedBronze : LuxuryColors.grey,
        ),
      ),
    );
  }
}
