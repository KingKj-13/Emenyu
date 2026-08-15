import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/features/admin/data/admin_repository.dart';

final adminMenuProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  return await ref.read(adminRepositoryProvider).fetchMenuTree();
});

class ContentManagementScreen extends ConsumerWidget {
  const ContentManagementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final menuAsync = ref.watch(adminMenuProvider);

    return Scaffold(
      backgroundColor: LuxuryColors.backgroundDarkest,
      appBar: AppBar(
        backgroundColor: LuxuryColors.backgroundDarkest,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: LuxuryColors.white, size: 18),
          onPressed: () => context.pop(),
        ),
        title: Text('CONTENT MANAGEMENT', style: LuxuryTypography.labelLarge),
      ),
      body: menuAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: LuxuryColors.brushedBronze)),
        error: (e, st) => Center(child: Text('Error: $e', style: const TextStyle(color: Colors.red))),
        data: (data) {
          final categories = data['categories'] as List<dynamic>? ?? [];
          
          if (categories.isEmpty) return const Center(child: Text('Menu is empty.', style: TextStyle(color: Colors.grey)));

          return ListView.builder(
            padding: const EdgeInsets.all(32),
            itemCount: categories.length,
            itemBuilder: (context, catIndex) {
              final category = categories[catIndex];
              final items = category['items'] as List<dynamic>? ?? [];

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(category['title'].toString().toUpperCase(), style: LuxuryTypography.displaySmall.copyWith(color: LuxuryColors.champagneGold)),
                  const SizedBox(height: 16),
                  ...items.map((item) => _MenuItemEditor(item: item)).toList(),
                  const SizedBox(height: 32),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

class _MenuItemEditor extends ConsumerStatefulWidget {
  final Map<String, dynamic> item;

  const _MenuItemEditor({required this.item});

  @override
  ConsumerState<_MenuItemEditor> createState() => _MenuItemEditorState();
}

class _MenuItemEditorState extends ConsumerState<_MenuItemEditor> {
  late TextEditingController _priceController;
  late TextEditingController _chefStoryController;
  late TextEditingController _ingredientStoryController;

  @override
  void initState() {
    super.initState();
    _priceController = TextEditingController(text: widget.item['price'].toString());
    final meta = widget.item['metadata_'] ?? {};
    _chefStoryController = TextEditingController(text: meta['chef_story'] ?? '');
    _ingredientStoryController = TextEditingController(text: meta['ingredient_story'] ?? '');
  }

  @override
  void dispose() {
    _priceController.dispose();
    _chefStoryController.dispose();
    _ingredientStoryController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final updatedData = {
      'price': double.tryParse(_priceController.text) ?? widget.item['price'],
      'chef_story': _chefStoryController.text,
      'ingredient_story': _ingredientStoryController.text,
    };
    await ref.read(adminRepositoryProvider).updateMenuItem(widget.item['id'], updatedData);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${widget.item['name']} updated. Connected devices notified.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: LuxuryColors.cardDark,
        border: Border.all(color: LuxuryColors.warmDarkBrown),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(widget.item['name'], style: LuxuryTypography.bodyLarge),
              SizedBox(
                width: 100,
                child: TextField(
                  controller: _priceController,
                  style: LuxuryTypography.priceSmall,
                  decoration: const InputDecoration(labelText: 'Price R', labelStyle: TextStyle(color: Colors.grey)),
                  keyboardType: TextInputType.number,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _chefStoryController,
            style: LuxuryTypography.bodySmall,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Chef Story (Editorial)', labelStyle: TextStyle(color: Colors.grey)),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _ingredientStoryController,
            style: LuxuryTypography.bodySmall,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Ingredient Story (Editorial)', labelStyle: TextStyle(color: Colors.grey)),
          ),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerRight,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: LuxuryColors.brushedBronze),
              onPressed: _save,
              child: Text('SAVE & DISPATCH', style: LuxuryTypography.buttonPrimary.copyWith(color: LuxuryColors.backgroundDarkest)),
            ),
          ),
        ],
      ),
    );
  }
}
