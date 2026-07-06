/// Menu item image/video paths are stored relative to Trump's own media
/// root (e.g. "Images/Tomahawk.jpg", "Video/demo/seafood.mp4") since the
/// Luxury Edition currently reuses Trump's existing media library. Resolve
/// them to real URLs the browser can fetch.
String resolveMediaUrl(String path) {
  if (path.isEmpty || path.startsWith('http') || path.startsWith('assets/')) {
    return path;
  }
  final trimmed = path.startsWith('/') ? path.substring(1) : path;
  return '/Trump/$trimmed';
}
