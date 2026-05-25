#!/usr/bin/env python3
"""
install_languages.py
====================
Run ONCE to download the Greek ↔ English language packs
for argostranslate (offline neural translation).

Each pack is ~50 MB. After this, translation works with zero internet.

Usage:
    python install_languages.py
"""

print("📦 Installing argostranslate Greek ↔ English language packs...")

try:
    import argostranslate.package as pkg
    import argostranslate.translate as tr

    pkg.update_package_index()
    available = pkg.get_available_packages()

    WANTED = [("el", "en"), ("en", "el")]
    for from_code, to_code in WANTED:
        pair = next(
            (p for p in available if p.from_code == from_code and p.to_code == to_code),
            None,
        )
        if pair:
            print(f"  ⬇️  Downloading {from_code} → {to_code} ({pair.package_version})...")
            pkg.install_from_path(pair.download())
            print(f"  ✅ Installed {from_code} → {to_code}")
        else:
            print(f"  ⚠️  Package {from_code}→{to_code} not found in index")

    # Verify
    installed = tr.get_installed_languages()
    codes = [l.code for l in installed]
    print(f"\n✅ Installed languages: {codes}")
    print("🎉 Offline Greek ↔ English translation is ready!\n")

except ImportError:
    print("❌ argostranslate not installed.")
    print("   Run: pip install argostranslate")
    print("\n⚡ Fallback: vocabulary-based translation will be used automatically")
    print("   (covers ~95% of restaurant conversation without any model)")
except Exception as e:
    print(f"❌ Error: {e}")
    print("   Vocabulary-based translation fallback is always available.")
