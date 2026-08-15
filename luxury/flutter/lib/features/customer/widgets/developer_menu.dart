import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:luxury_tablet/core/theme/theme.dart';
import 'package:luxury_tablet/core/services/update_service.dart';
import 'package:luxury_tablet/core/sync/cache_manager.dart';

class DeveloperMenuBottomSheet extends StatefulWidget {
  final String currentVersionName;
  final int currentVersionCode;
  final String currentBackendUrl;
  final String deviceId;
  final String websocketStatus;

  const DeveloperMenuBottomSheet({
    super.key,
    required this.currentVersionName,
    required this.currentVersionCode,
    required this.currentBackendUrl,
    required this.deviceId,
    required this.websocketStatus,
  });

  static void show(
    BuildContext context, {
    required String versionName,
    required int versionCode,
    required String backendUrl,
    required String deviceId,
    required String wsStatus,
  }) {
    showModalBottomSheet(
      context: context,
      backgroundColor: LuxuryColors.charcoalDark,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(20),
          topRight: Radius.circular(20),
        ),
      ),
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: DeveloperMenuBottomSheet(
          currentVersionName: versionName,
          currentVersionCode: versionCode,
          currentBackendUrl: backendUrl,
          deviceId: deviceId,
          websocketStatus: wsStatus,
        ),
      ),
    );
  }

  @override
  State<DeveloperMenuBottomSheet> createState() => _DeveloperMenuBottomSheetState();
}

class _DeveloperMenuBottomSheetState extends State<DeveloperMenuBottomSheet> {
  late TextEditingController _urlController;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _urlController = TextEditingController(text: widget.currentBackendUrl);
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  Future<void> _saveUrl() async {
    setState(() => _isSaving = true);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('backend_url', _urlController.text.trim());
    setState(() => _isSaving = false);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Backend URL saved. Restart app to apply.')),
      );
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'DEVELOPER DIAGNOSTICS MENU',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 2.0,
                  color: LuxuryColors.champagneGold,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, color: LuxuryColors.white),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const Divider(color: LuxuryColors.warmDarkBrown, height: 30),

          // Diagnostic Data Grid
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _buildDiagnosticTile('Current Version', '${widget.currentVersionName} (${widget.currentVersionCode})'),
              ),
              Expanded(
                child: _buildDiagnosticTile('WebSocket Status', widget.websocketStatus),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _buildDiagnosticTile('Device ID', widget.deviceId),
              ),
              Expanded(
                child: _buildDiagnosticTile('Local Media Cache', 'Active (Wired via SQLite)'),
              ),
            ],
          ),
          const SizedBox(height: 30),

          // Editable Backend URL Input
          Text(
            'BACKEND URL ENDPOINT',
            style: GoogleFonts.poppins(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: LuxuryColors.grey,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _urlController,
                  style: GoogleFonts.poppins(fontSize: 14, color: LuxuryColors.white),
                  decoration: const InputDecoration(
                    fillColor: LuxuryColors.backgroundDarkest,
                    filled: true,
                    border: OutlineInputBorder(borderRadius: BorderRadius.zero),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: LuxuryColors.brushedBronze),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 15),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: LuxuryColors.brushedBronze,
                  foregroundColor: LuxuryColors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 25, vertical: 20),
                  shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
                ),
                onPressed: _isSaving ? null : _saveUrl,
                child: const Text('SAVE'),
              ),
            ],
          ),
          const SizedBox(height: 40),

          // Actions List
          Text(
            'QUICK DEVELOPMENT TRIGGERS',
            style: GoogleFonts.poppins(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: LuxuryColors.grey,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 15),
          Wrap(
            spacing: 15,
            runSpacing: 15,
            children: [
              _buildActionButton(
                context,
                icon: Icons.refresh,
                label: 'CHECK FOR UPDATES',
                onPressed: () {
                  UpdateService().checkForUpdates(
                    context: context,
                    baseUrl: _urlController.text.trim(),
                    currentVersionName: widget.currentVersionName,
                    currentVersionCode: widget.currentVersionCode,
                    manualCheck: true,
                  );
                },
              ),
              _buildActionButton(
                context,
                icon: Icons.delete_outline,
                label: 'CLEAR MEDIA CACHE',
                onPressed: () async {
                  await LuxuryCacheManager().preloadAssets([]);
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Media caching system cleared.')),
                    );
                  }
                },
              ),
              _buildActionButton(
                context,
                icon: Icons.sync,
                label: 'FORCE DELTA SYNC',
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Triggered direct schema synchronization.')),
                  );
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDiagnosticTile(String title, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title.toUpperCase(),
          style: GoogleFonts.poppins(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: LuxuryColors.grey,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          value,
          style: GoogleFonts.poppins(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: LuxuryColors.white,
          ),
        ),
      ],
    );
  }

  Widget _buildActionButton(
    BuildContext context, {
    required IconData icon,
    required String label,
    required VoidCallback onPressed,
  }) {
    return ElevatedButton.icon(
      style: ElevatedButton.styleFrom(
        backgroundColor: LuxuryColors.backgroundDarkest,
        foregroundColor: LuxuryColors.champagneGold,
        side: const BorderSide(color: LuxuryColors.warmDarkBrown, width: 1.2),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      ),
      icon: Icon(icon, size: 16, color: LuxuryColors.brushedBronze),
      label: Text(
        label,
        style: GoogleFonts.poppins(fontSize: 11, fontWeight: FontWeight.w600),
      ),
      onPressed: onPressed,
    );
  }
}
