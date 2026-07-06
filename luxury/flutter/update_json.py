import json

path = r"d:\Projects\Emenyu\luxury\flutter\assets\luxury_menu.json"

prices = {
    1: 3500, 2: 1200, 3: 1100, 4: 1400,
    5: 4500, 6: 3200, 7: 2900,
    8: 3800, 9: 4200, 10: 2400,
    11: 9500, 12: 11000, 13: 14500, 14: 6500, 15: 4800,
    16: 35000, 17: 38000, 18: 19500, 19: 16500, 20: 22000,
    21: 1400, 22: 1600, 23: 2800, 24: 1200, 25: 900,
    26: 550, 27: 450, 28: 800
}

with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Update prices
for cat in data['categories']:
    for item in cat['items']:
        if item['id'] in prices:
            item['price'] = prices[item['id']]

# Merge whisky categories
whisky_cats = [c for c in data['categories'] if c['id'] == 'whisky']
if len(whisky_cats) > 1:
    main_whisky = whisky_cats[0]
    for other in whisky_cats[1:]:
        main_whisky['items'].extend(other['items'])
        data['categories'].remove(other)

with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=4, ensure_ascii=False)

print("JSON updated successfully")
