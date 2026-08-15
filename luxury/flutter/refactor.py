import os
import shutil

base = r"d:\Projects\Emenyu\luxury\flutter\lib"

# Define mappings: old_path -> new_path
mappings = {
    "api/api_client.dart": "core/networking/api_client.dart",
    "api/ws_client.dart": "core/websocket/ws_client.dart",
    "data/local/database.dart": "core/database/database.dart",
    "data/local/database.g.dart": "core/database/database.g.dart",
    "data/repository/menu_repository.dart": "core/repositories/menu_repository.dart",
    "screens/category_selection_screen.dart": "features/customer/screens/category_selection_screen.dart",
    "screens/item_detail_screen.dart": "features/customer/screens/item_detail_screen.dart",
    "screens/main_experience_screen.dart": "features/customer/screens/main_experience_screen.dart",
    "screens/welcome_screen.dart": "features/customer/screens/welcome_screen.dart",
    "services/update_service.dart": "core/services/update_service.dart",
    "sync/asset_pipeline.dart": "core/sync/asset_pipeline.dart",
    "sync/cache_manager.dart": "core/sync/cache_manager.dart",
    "sync/sync_engine.dart": "core/sync/sync_engine.dart",
    "theme/theme.dart": "core/theme/theme.dart",
    "utils/image_preloader.dart": "core/utils/image_preloader.dart",
    "widgets/bottom_nav_bar.dart": "features/customer/widgets/bottom_nav_bar.dart",
    "widgets/developer_menu.dart": "features/customer/widgets/developer_menu.dart",
    "widgets/pairing_dialog.dart": "features/customer/widgets/pairing_dialog.dart",
    "widgets/story_renderer.dart": "features/customer/widgets/story_renderer.dart",
    "widgets/cinematic_pan.dart": "core/widgets/cinematic_pan.dart",
    "widgets/living_photograph.dart": "core/widgets/living_photograph.dart",
    "widgets/luxury_image.dart": "core/widgets/luxury_image.dart",
}

# Create dirs
dirs_to_make = set(os.path.dirname(os.path.join(base, v)) for v in mappings.values())
for d in dirs_to_make:
    os.makedirs(d, exist_ok=True)

# Move files
for old, new in mappings.items():
    old_p = os.path.join(base, old)
    new_p = os.path.join(base, new)
    if os.path.exists(old_p):
        os.rename(old_p, new_p)

# Import replacements rules
replacements = {
    "package:luxury_tablet/api/api_client.dart": "package:luxury_tablet/core/networking/api_client.dart",
    "package:luxury_tablet/api/ws_client.dart": "package:luxury_tablet/core/websocket/ws_client.dart",
    "package:luxury_tablet/data/local/database.dart": "package:luxury_tablet/core/database/database.dart",
    "package:luxury_tablet/data/repository/menu_repository.dart": "package:luxury_tablet/core/repositories/menu_repository.dart",
    "package:luxury_tablet/screens/": "package:luxury_tablet/features/customer/screens/",
    "package:luxury_tablet/services/": "package:luxury_tablet/core/services/",
    "package:luxury_tablet/sync/": "package:luxury_tablet/core/sync/",
    "package:luxury_tablet/theme/": "package:luxury_tablet/core/theme/",
    "package:luxury_tablet/utils/": "package:luxury_tablet/core/utils/",
    "package:luxury_tablet/widgets/bottom_nav_bar.dart": "package:luxury_tablet/features/customer/widgets/bottom_nav_bar.dart",
    "package:luxury_tablet/widgets/developer_menu.dart": "package:luxury_tablet/features/customer/widgets/developer_menu.dart",
    "package:luxury_tablet/widgets/pairing_dialog.dart": "package:luxury_tablet/features/customer/widgets/pairing_dialog.dart",
    "package:luxury_tablet/widgets/story_renderer.dart": "package:luxury_tablet/features/customer/widgets/story_renderer.dart",
    "package:luxury_tablet/widgets/cinematic_pan.dart": "package:luxury_tablet/core/widgets/cinematic_pan.dart",
    "package:luxury_tablet/widgets/living_photograph.dart": "package:luxury_tablet/core/widgets/living_photograph.dart",
    "package:luxury_tablet/widgets/luxury_image.dart": "package:luxury_tablet/core/widgets/luxury_image.dart",
}

for root, _, files in os.walk(base):
    for file in files:
        if file.endswith(".dart"):
            p = os.path.join(root, file)
            with open(p, "r", encoding="utf-8") as f:
                content = f.read()
            
            orig = content
            for old_i, new_i in replacements.items():
                content = content.replace(old_i, new_i)
                
            if content != orig:
                with open(p, "w", encoding="utf-8") as f:
                    f.write(content)

# Clean up empty old directories
for old_dir in ["api", "data/local", "data/repository", "data", "screens", "services", "sync", "theme", "utils", "widgets"]:
    p = os.path.join(base, old_dir)
    if os.path.exists(p) and not os.listdir(p):
        os.rmdir(p)

print("Restructure complete!")
