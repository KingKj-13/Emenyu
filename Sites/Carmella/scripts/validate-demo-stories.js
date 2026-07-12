#!/usr/bin/env node
'use strict';
// One-off validation harness for the six deterministic demo stories (2026-07-12
// pitch). Exercises aiService.recommend()/chat()/cartRecommendations() directly
// in-process -- same modules the real server uses -- WITHOUT starting an HTTP
// server, so it can't collide with anything already running on Carmella's port.
process.env.TZ = 'Africa/Johannesburg';
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { createConfig } = require('../../Trump/server/utils/helpers');
const { FileService } = require('../../Trump/server/services/fileService');
const { AiService } = require('../../Trump/server/services/aiService');

const STORIES = [
  { name: 'M-1 Quick Business Breakfast', dayPart: 'morning', steps: ['Morning in Jozi', 'Americano', 'Red Juice'] },
  { name: 'M-2 Healthy Start', dayPart: 'morning', steps: ['Whole Oats', 'Green Juice', 'Nicole in Thessaloniki', "Jennifer's Vanilla Matcha"] },
  { name: 'M-3 Premium Weekend Breakfast', dayPart: 'morning', steps: ["Matteo's Mimosa", 'Mademoiselle Benedict', "Diane's French Toast", 'Cappuccino', 'Brussels Waffles'] },
  { name: 'A-1 Casual Lunch', dayPart: 'midday', steps: ['Calamari in Nice', 'Texan Beef Burger', "Femi's", 'Corona', 'Chocolate Brownie'] },
  { name: 'A-2 Business Lunch', dayPart: 'midday', steps: ['Burrata in Venice', "Oslo's Flame", 'Tokara Sauvignon Blanc', 'Sir Gaspard Salad', 'Americano'] },
  { name: 'A-3 Premium Dinner / Celebration', dayPart: 'golden', steps: ["Sir Gaspard's Garden Spritz", 'Prawns in Maputo', 'Iron Fillet', 'Rupert & Rothschild Classique Blend', "MC's", 'Positano Lemon Crème Brûlée', 'Hozanna Velvet Shot'] }
];

function fmt(n) { return `R${Number(n).toFixed(2)}`; }

async function main() {
  const config = createConfig(path.resolve(__dirname, '..'));
  console.log('restaurantId:', config.restaurantId, '| scriptedDemo:', JSON.stringify(config.scriptedDemo), '| persona:', config.assistantPersona);
  const fileService = new FileService(config, { logger: null });
  const aiService = new AiService(config, fileService, null, { logger: null });

  let allPass = true;

  for (const story of STORIES) {
    console.log(`\n=== ${story.name} (${story.dayPart}) ===`);
    const cart = [];
    let subtotal = 0;
    const tableId = 'table1';

    const menuContext = await aiService.getMenuContext();

    for (let i = 0; i < story.steps.length; i++) {
      const name = story.steps[i];

      // Guest adds THIS step's item first (mirrors the real UI: add -> then
      // see the Chef's Pick for what comes next), using the resolved menu
      // price the client would actually send.
      const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const item = menuContext.items.find(it => it.name.toLowerCase().replace(/[^a-z0-9]/g, '') === key);
      if (!item) {
        console.log(`  [FAIL] could not find menu item "${name}"`);
        allPass = false;
        continue;
      }
      cart.push({ name: item.name, price: item.price, qty: 1 });
      subtotal += Number(item.price) || 0;

      // 1) recommend() -- what the customer's Chef's Pick card / cart-level reco shows
      const recs = await aiService.recommend({ cart, tableId });
      const recNames = recs.map(r => r.name);

      // 2) chat() -- what Gaspard says when asked a generic recommendation question
      const chatRes = await aiService.chat({
        message: i === 0 ? "what's good?" : 'what do you recommend?',
        cart,
        tableId,
        dayPart: story.dayPart,
        history: i === 0 ? [] : [{ role: 'assistant', content: 'placeholder' }]
      });

      // 3) cartRecommendations() -- what the WAITER's card shows for the same cart
      const waiterRes = await aiService.cartRecommendations({ cart, tableId });
      const waiterNames = (waiterRes.recommendations || []).map(r => r.name);

      const expectedNext = i + 1 < story.steps.length ? story.steps[i + 1] : null;

      if (expectedNext) {
        const recMatch = recNames[0] === expectedNext;
        const chatMatch = (chatRes.suggestions || []).map(s => s.name)[0] === expectedNext;
        const waiterMatch = waiterNames[0] === expectedNext;
        const conf = recs[0]?.confidence;
        const status = recMatch && chatMatch && waiterMatch ? 'PASS' : 'FAIL';
        if (status === 'FAIL') allPass = false;
        console.log(
          `  [${status}] after "${name}" -> expect "${expectedNext}" | recommend:${JSON.stringify(recNames)} chat:${JSON.stringify((chatRes.suggestions || []).map(s => s.name))} waiter:${JSON.stringify(waiterNames)} chef:${recs[0]?.chef} conf:${conf}`
        );
        if (status === 'FAIL') {
          console.log('     chat reply:', chatRes.reply);
        }
      } else {
        // Last step added -- chain should now report 'done' (no further pick).
        const done = recNames.length === 0;
        if (!done) allPass = false;
        console.log(`  [${done ? 'PASS' : 'FAIL'}] after final step "${name}" -> expect done (no pick) | got:${JSON.stringify(recNames)}`);
      }
    }

    const total = subtotal * 1.20;
    console.log(`  Subtotal: ${fmt(subtotal)} | +20% VAT/service: ${fmt(subtotal * 0.20)} | Total: ${fmt(total)}`);
  }

  console.log(allPass ? '\nALL STORIES PASS' : '\nSOME STORIES FAILED');
  process.exit(allPass ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
