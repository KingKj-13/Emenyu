// Curated one-tap "orders" for the demo — one per guest persona.
// Each bundle is a full meal: a drink, starter, main and dessert, using real
// menu items chosen to have good photos/videos and upsell pairings.

export interface OrderCourse {
  course: 'Drink' | 'Starter' | 'Main' | 'Dessert';
  name: string;
  price: number;
}

export interface PersonaOrder {
  id: string;
  persona: string;
  icon: string;
  blurb: string;
  accent: string;
  courses: OrderCourse[];
}

export const RECOMMENDED_ORDERS: PersonaOrder[] = [
  {
    id: 'sushi',
    persona: 'The Sushi Lover',
    icon: '🍱',
    blurb: 'Fresh, delicate and made to share.',
    accent: '#4d7f82',
    courses: [
      { course: 'Drink', name: 'COSMOPOLITAN', price: 145 },
      { course: 'Starter', name: 'CRISPY RICE', price: 195 },
      { course: 'Main', name: 'CALIFORNIA ROLL - SALMON (8pc)', price: 189 },
      { course: 'Dessert', name: 'DUO OF ICE CREAM', price: 99 },
    ],
  },
  {
    id: 'steak',
    persona: 'The Steak Lover',
    icon: '🥩',
    blurb: 'Flame-grilled, dry-aged, unapologetic.',
    accent: '#a52b2d',
    courses: [
      { course: 'Drink', name: 'TRUMPS', price: 225 },
      { course: 'Starter', name: 'BEEF BILTONG', price: 155 },
      { course: 'Main', name: 'RIBEYE 380g', price: 369 },
      { course: 'Dessert', name: 'DEATH BY CHOCOLATE CAKE', price: 119 },
    ],
  },
  {
    id: 'fish',
    persona: 'The Fish Lover',
    icon: '🐟',
    blurb: 'From the coast, line to plate.',
    accent: '#3a6e8f',
    courses: [
      { course: 'Drink', name: 'MOJITO', price: 145 },
      { course: 'Starter', name: 'FALKLANDS CALAMARI', price: 285 },
      { course: 'Main', name: 'KINGKLIP FILLET', price: 365 },
      { course: 'Dessert', name: 'CAPE MALVA PUDDING', price: 115 },
    ],
  },
  {
    id: 'veg',
    persona: 'The Vegetarian',
    icon: '🥦',
    blurb: 'Garden-forward and full of colour.',
    accent: '#5c7a4f',
    courses: [
      { course: 'Drink', name: 'MARGARITA', price: 145 },
      { course: 'Starter', name: 'CAPRESE & AVOCADO SALAD', price: 149 },
      { course: 'Main', name: 'VEG PLATTER', price: 255 },
      { course: 'Dessert', name: 'TRIO OF ICE CREAM', price: 119 },
    ],
  },
  {
    id: 'pasta',
    persona: 'The Pasta Lover',
    icon: '🍝',
    blurb: 'Comfort, twirled to perfection.',
    accent: '#b5651d',
    courses: [
      { course: 'Drink', name: 'PINA COLADA', price: 145 },
      { course: 'Starter', name: 'CHICKEN TRINCHADO', price: 125 },
      { course: 'Main', name: 'BEEF FILLET PASTA', price: 289 },
      { course: 'Dessert', name: 'RED VELVET CAKE', price: 115 },
    ],
  },
];
