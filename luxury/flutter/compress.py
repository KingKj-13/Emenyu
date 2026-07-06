import os
import glob
from PIL import Image

image_dir = r"d:\Projects\Emenyu\luxury\flutter\assets\images"
json_path = r"d:\Projects\Emenyu\luxury\flutter\assets\luxury_menu.json"

# Compress images
png_files = glob.glob(os.path.join(image_dir, "*.png"))
for path in png_files:
    print(f"Compressing {os.path.basename(path)}...")
    img = Image.open(path)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    img.thumbnail((1920, 1920), Image.Resampling.LANCZOS)
    new_path = path.replace(".png", ".jpg")
    img.save(new_path, "JPEG", quality=80, optimize=True)
    img.close()
    try:
        os.remove(path)
    except Exception as e:
        print(f"Could not remove {path}: {e}")

# Update JSON
with open(json_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(".png", ".jpg")

with open(json_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Images compressed and JSON updated.")
