import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:luxury_tablet/core/theme/theme.dart';

class UpdateService {
  static final UpdateService _instance = UpdateService._internal();
  factory UpdateService() => _instance;
  UpdateService._internal();

  bool _isChecking = false;

  Future<void> checkForUpdates({
    required BuildContext context,
    required String baseUrl,
    required String currentVersionName,
    required int currentVersionCode,
    bool manualCheck = false,
  }) async {
    // On web, skip APK update checks — the web app is always the latest deployed version
    if (kIsWeb) {
      if (manualCheck && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Web application is always up to date.'),
          ),
        );
      }
      return;
    }

    if (_isChecking) return;
    _isChecking = true;

    try {
      final url = Uri.parse(
        '$baseUrl/app/check-update?appType=customer_tablet&currentVersionCode=$currentVersionCode',
      );
      final response = await http.get(url);

      _isChecking = false;

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final updateAvailable = data['updateAvailable'] ?? false;
        final forceUpdate = true; // Blocking force-update required
        final latest = data['latestVersion'];

        if (updateAvailable && latest != null) {
          if (context.mounted) {
            _showUpdateDialog(
              context: context,
              versionName: latest['versionName'],
              versionCode: latest['versionCode'],
              apkUrl: latest['apkUrl'],
              releaseNotes:
                  latest['releaseNotes'] ?? 'No release notes provided.',
              forceUpdate: forceUpdate,
            );
          }
        } else if (manualCheck && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text('Your application is up to date.')),
          );
        }
      }
    } catch (_) {
      _isChecking = false;
      if (manualCheck && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text(
                  'Failed to check for updates. Verify connection.')),
        );
      }
    }
  }

  void _showUpdateDialog({
    required BuildContext context,
    required String versionName,
    required int versionCode,
    required String apkUrl,
    required String releaseNotes,
    required bool forceUpdate,
  }) {
    showDialog(
      context: context,
      barrierDismissible: !forceUpdate,
      builder: (BuildContext dialogContext) {
        String statusText = 'A new version ($versionName) is available.';

        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              backgroundColor: LuxuryColors.charcoalDark,
              shape: const RoundedRectangleBorder(
                  borderRadius: BorderRadius.zero),
              title: Row(
                children: [
                  const Icon(Icons.system_update_alt,
                      color: LuxuryColors.brushedBronze),
                  const SizedBox(width: 12),
                  Text(
                    forceUpdate
                        ? 'CRITICAL UPDATE REQUIRED'
                        : 'UPDATE AVAILABLE',
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    statusText,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 15),
                  Text(
                    'Release Notes:',
                    style: Theme.of(context)
                        .textTheme
                        .labelLarge
                        ?.copyWith(fontSize: 11),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    releaseNotes,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
              actions: [
                if (!forceUpdate)
                  TextButton(
                    onPressed: () => Navigator.of(dialogContext).pop(),
                    child: Text(
                      'LATER',
                      style: Theme.of(context)
                          .textTheme
                          .labelLarge
                          ?.copyWith(color: LuxuryColors.grey),
                    ),
                  ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: LuxuryColors.brushedBronze,
                    foregroundColor: LuxuryColors.white,
                    shape: const RoundedRectangleBorder(
                        borderRadius: BorderRadius.zero),
                  ),
                  onPressed: () {
                    // On native: would download APK. Placeholder for now.
                    Navigator.of(dialogContext).pop();
                  },
                  child: const Text('UPDATE NOW'),
                ),
              ],
            );
          },
        );
      },
    );
  }
}
