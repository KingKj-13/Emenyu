import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/core/repositories/menu_repository.dart';
import 'package:luxury_tablet/features/waiter/providers/waiter_providers.dart';

class WaiterMenuScreen extends ConsumerWidget {
  final String tableId;

  const WaiterMenuScreen({super.key, required this.tableId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final menuAsync = ref.watch(menuTreeProvider);

    return Scaffold(
      backgroundColor: LuxuryColors.backgroundDarkest,
      appBar: AppBar(
        backgroundColor: LuxuryColors.backgroundDarkest,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: LuxuryColors.white, size: 18),
          onPressed: () => context.pop(),
        ),
        title: Text(
          'ADD ITEMS - TABLE $tableId',
          style: LuxuryTypography.labelLarge,
        ),
      ),
      body: Row(
        children: [
          // Left: Dense Menu List
          Expanded(
            flex: 2,
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: const BoxDecoration(
                border: Border(right: BorderSide(color: LuxuryColors.warmDarkBrown, width: 1)),
              ),
              child: menuAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, st) => Text('Error: $e'),
                data: (tree) {
                  // Flatten categories into a single list of items with their category name
                  final List<Map<String, dynamic>> items = [];
                  for (final cat in tree) {
                    final catItems = cat['items'] as List<dynamic>? ?? [];
                    for (final item in catItems) {
                      items.add({
                        'id': item['id'],
                        'category': cat['name'],
                        'name': item['name'],
                        'price': item['price'],
                        'description': item['description'] ?? '',
                      });
                    }
                  }
                  return ListView.builder(
                    itemCount: items.length,
                    itemBuilder: (context, index) {
                      final item = items[index];
                      return _DenseMenuItemCard(
                        item: item,
                        onAdd: () {
                          ref.read(activeCartProvider(tableId).notifier).addItem({
                            'item_id': item['id'],
                            'name': item['name'],
                            'price': item['price'],
                            'quantity': 1,
                            'note': '',
                          });
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('${item['name']} added to cart.', style: LuxuryTypography.bodyMedium), duration: const Duration(seconds: 1)),
                          );
                        },
                      );
                    },
                  );
                },
              ),
            ),
          ),
          // Right: Active Cart (Reused from Table Overview but just summary)
          Expanded(
            flex: 1,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('CART PREVIEW', style: LuxuryTypography.labelLarge),
                  const SizedBox(height: 24),
                  Expanded(
                    child: Consumer(
                      builder: (context, ref, _) {
                        final cartAsync = ref.watch(activeCartProvider(tableId));
                        final cart = cartAsync.value ?? [];
                        if (cart.isEmpty) return const Text('Cart is empty', style: TextStyle(color: Colors.grey));

                        return ListView.builder(
                          itemCount: cart.length,
                          itemBuilder: (context, index) {
                            final cartItem = cart[index];
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 12.0),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(cartItem['name'], style: LuxuryTypography.bodyMedium),
                                  Text('R ${cartItem['price']}', style: LuxuryTypography.bodyMedium),
                                ],
                              ),
                            );
                          },
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DenseMenuItemCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final VoidCallback onAdd;

  const _DenseMenuItemCard({required this.item, required this.onAdd});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: LuxuryColors.cardDark,
        border: Border.all(color: LuxuryColors.warmDarkBrown),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item['category'].toUpperCase(), style: LuxuryTypography.labelSmall.copyWith(color: LuxuryColors.brushedBronze)),
                const SizedBox(height: 4),
                Text(item['name'], style: LuxuryTypography.bodyLarge),
                const SizedBox(height: 2),
                Text(item['description'], style: LuxuryTypography.bodySmall.copyWith(color: LuxuryColors.grey)),
              ],
            ),
          ),
          Row(
            children: [
              Text('R ${item['price']}', style: LuxuryTypography.priceSmall),
              const SizedBox(width: 24),
              InkWell(
                onTap: onAdd,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: const BoxDecoration(
                    color: LuxuryColors.brushedBronze,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.add, color: LuxuryColors.backgroundDarkest, size: 20),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
