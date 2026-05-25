import qrcode
import os

# --- YOUR SPECIFIC NGROK URL ---
BASE_URL = "https://radiochemical-anecdotically-ria.ngrok-free.dev" 
OUTPUT_FOLDER = "Table_QR_Codes"

# Create folder if it doesn't exist
if not os.path.exists(OUTPUT_FOLDER):
    os.makedirs(OUTPUT_FOLDER)

print(f"Generating QR Codes for {BASE_URL}...")

for i in range(1, 11): # Generates for Tables 1 to 10
    # This creates the link: https://...dev/?table=1
    link = f"{BASE_URL}/?table={i}"
    
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