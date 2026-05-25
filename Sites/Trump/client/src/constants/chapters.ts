import type { Chapter } from '../types/menu';

export const FOOD_CHAPTERS: Chapter[] = [
  { key: 'starters',  title: 'To Start',               apiKey: 'Starters',              subs: ['SMALL PLATES'] },
  { key: 'tempura',   title: 'Tempura',                  apiKey: 'Starters',              subs: ['TEMPURA'] },
  { key: 'salads',    title: 'Bespoke Salads',            apiKey: 'Salads',                subs: null },
  { key: 'sushi',     title: 'Sushi & Sashimi',           apiKey: 'Sushi',                 subs: null },
  { key: 'seafood',   title: 'Signature Seafood',         apiKey: 'Signature Seafood',     subs: null },
  { key: 'steaks',    title: 'Trumps Premium Steaks',     apiKey: 'Trumps Premium Steaks', subs: null },
  { key: 'pork',      title: 'Pork & Ribs',               apiKey: 'Pork & Ribs',           subs: null },
  { key: 'lamb',      title: 'Lamb',                      apiKey: 'Lamb',                  subs: null },
  { key: 'venison',   title: 'Venison & Game',            apiKey: 'Venison & Game',        subs: null },
  { key: 'oxtail',    title: 'Oxtail & Beef Ribs',        apiKey: 'Oxtail & Beef Ribs',    subs: null },
  { key: 'combos',    title: 'Signature Combos',          apiKey: 'Signature Combos',      subs: ["SIGNATURE COMBO'S SINCE 1994"] },
  { key: 'platters',  title: 'Signature Platters',        apiKey: 'Signature Combos',      subs: ['TRUMPS SIGNATURE PLATTERS'] },
  { key: 'burgers',   title: 'Gourmet Burgers',           apiKey: 'Burgers',               subs: null },
  { key: 'chicken',   title: 'Chicken Dishes',            apiKey: 'Chicken Dishes',        subs: null },
  { key: 'pastas',    title: 'Trumps Pastas',             apiKey: 'Pastas',                subs: null },
  { key: 'veg',       title: 'Vegetarian',                apiKey: 'Vegetarian',            subs: null },
  { key: 'sides',     title: 'Sides & Extras',            apiKey: 'Sides',                 subs: null },
  { key: 'dessert',   title: 'Dessert & Cakes',           apiKey: 'Dessert',               subs: null },
];

export const DRINKS_CHAPTERS: Chapter[] = [
  { key: 'sparkling', title: 'Sparkling',              apiKey: 'Champagne',                   subs: null },
  { key: 'white',     title: 'White Wine',              apiKey: 'White Wine',                  subs: null },
  { key: 'red',       title: 'Red Wine',                apiKey: 'Red Wine',                    subs: null },
  { key: 'beer',      title: 'Beer & Cider',            apiKey: 'Beers',                       subs: null },
  { key: 'spirits',   title: 'Spirits',                 apiKey: 'Spirits',
    excludeSubs: ['LIQUEURS', 'DIGESTIFS, PORTS & APERITIFS'] },
  { key: 'liqueurs',  title: 'Liqueurs & After-Dinner', apiKey: 'Spirits',
    subs: ['LIQUEURS', 'DIGESTIFS, PORTS & APERITIFS'] },
  { key: 'soft',      title: 'Soft & Hot',              apiKey: 'Mocktails & Cold Beverages',  subs: null },
  { key: 'cocktails', title: 'Cocktails',               apiKey: 'Cocktails',                   subs: null },
];
