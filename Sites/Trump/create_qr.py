import os
import qrcode

BASE_URL = os.getenv("PUBLIC_BASE_URL") or os.getenv("TRUMP_PUBLIC_ORIGIN")
if not BASE_URL and os.getenv("NODE_ENV") == "production":
    raise RuntimeError("Set PUBLIC_BASE_URL or TRUMP_PUBLIC_ORIGIN before generating production QR codes.")

BASE_URL = BASE_URL or "http://127.0.0.1:3012"
OUTPUT_FOLDER = "Table_QR_Codes"

# Create folder if it doesn't exist
if not os.path.exists(OUTPUT_FOLDER):
    os.makedirs(OUTPUT_FOLDER)

print(f"Generating QR Codes for {BASE_URL}...")

for i in range(1, 11): # Generates for Tables 1 to 10
    link = f"{BASE_URL}/Trump/table{i}"
    
    # Generate QR Code
    qr = qrcode.QRCode(box_size=10, border=4)
    qr.add_data(link)
    qr.make(fit=True)
    
    # Save Image
    img = qr.make_image(fill_color="black", back_color="white")
    filename = f"{OUTPUT_FOLDER}/Table_{i}.png"
    img.save(filename)
    print(f"Saved: {filename}")

print(f"\nDone! Check the '{OUTPUT_FOLDER}' folder for your images.")
