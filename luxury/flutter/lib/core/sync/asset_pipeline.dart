import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:luxury_tablet/core/networking/api_client.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final assetPipelineProvider = Provider((ref) => AssetPipeline(
      apiClient: ref.watch(apiClientProvider),
    ));

class AssetPipeline {
  final ApiClient apiClient;
  bool _isSyncing = false;

  AssetPipeline({required this.apiClient});

  Future<void> syncAssets() async {
    if (_isSyncing) return;
    _isSyncing = true;

    try {
      final prefs = await SharedPreferences.getInstance();
      final currentVersion = prefs.getInt('asset_version') ?? 0;

      final manifestData = await apiClient.syncManifest(currentVersion);
      if (manifestData == null || manifestData['assets'] == null) return;

      final List<dynamic> assets = manifestData['assets'];
      final newVersion = manifestData['version'] ?? currentVersion;

      final appDir = await getApplicationDocumentsDirectory();
      final mediaDir = Directory(p.join(appDir.path, 'media_cache'));
      if (!await mediaDir.exists()) {
        await mediaDir.create(recursive: true);
      }

      final validPaths = <String>{};

      // 1. Download / Verify Assets
      for (final assetMap in assets) {
        final relativePath = assetMap['path'] as String;
        final url = assetMap['url'] as String;
        final expectedHash = assetMap['sha256'] as String?;
        final expectedSize = assetMap['size_bytes'] as int? ?? 0;

        validPaths.add(relativePath);

        final localFile = File(p.join(mediaDir.path, relativePath));
        if (await localFile.exists()) {
          // Verify
          if (expectedSize == await localFile.length() &&
              expectedHash != null &&
              await _verifyHash(localFile, expectedHash)) {
            continue; // Already downloaded and valid
          }
        }

        // Needs download (resumable)
        await _downloadResumable(url, localFile, expectedHash, expectedSize);
      }

      // 2. Cleanup old assets
      final allFiles = mediaDir.listSync(recursive: true).whereType<File>();
      for (final file in allFiles) {
        final relative = p.relative(file.path, from: mediaDir.path).replaceAll(r'\', '/');
        if (!validPaths.contains(relative)) {
          await file.delete();
        }
      }

      await prefs.setInt('asset_version', newVersion);
    } finally {
      _isSyncing = false;
    }
  }

  Future<bool> _verifyHash(File file, String expectedHash) async {
    final bytes = await file.readAsBytes();
    final digest = sha256.convert(bytes);
    return digest.toString() == expectedHash;
  }

  Future<void> _downloadResumable(String url, File file, String? expectedHash, int expectedSize) async {
    await file.parent.create(recursive: true);

    int startByte = 0;
    if (await file.exists()) {
      startByte = await file.length();
      if (startByte > expectedSize) {
        await file.delete();
        startByte = 0;
      }
    }

    if (startByte < expectedSize) {
      final request = http.Request('GET', Uri.parse(url));
      if (startByte > 0) {
        request.headers['Range'] = 'bytes=$startByte-';
      }

      final response = await request.send();
      if (response.statusCode == 200 || response.statusCode == 206) {
        final sink = file.openWrite(mode: startByte > 0 && response.statusCode == 206 ? FileMode.append : FileMode.write);
        await response.stream.pipe(sink);
        await sink.close();
      }
    }

    if (expectedHash != null) {
      if (!await _verifyHash(file, expectedHash)) {
        await file.delete(); // Delete corrupted file
      }
    }
  }

  Future<String?> getLocalAssetPath(String relativePath) async {
    final appDir = await getApplicationDocumentsDirectory();
    final file = File(p.join(appDir.path, 'media_cache', relativePath));
    if (await file.exists()) {
      return file.path;
    }
    return null;
  }
}
