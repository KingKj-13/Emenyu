/// Menu item image/video paths come from two sources:
/// - Legacy Trump-hosted paths (e.g. "Images/Tomahawk.jpg") since the
///   Luxury Edition originally reused Trump's existing media library.
/// - Luxury-authored paths under "hero/", "video/", "category/", "chef/"
///   (matching the Luxury backend's own media directory layout), served
///   statically by nginx at /Trump_Lux/media/.
/// Resolve them to real URLs the browser can fetch.
const _luxuryMediaPrefixes = ['hero/', 'video/', 'category/', 'chef/'];

String resolveMediaUrl(String path) {
  if (path.isEmpty || path.startsWith('http') || path.startsWith('assets/')) {
    return path;
  }
  final trimmed = path.startsWith('/') ? path.substring(1) : path;
  if (_luxuryMediaPrefixes.any((prefix) => trimmed.startsWith(prefix))) {
    return '/Trump_Lux/media/$trimmed';
  }
  return '/Trump/$trimmed';
}
