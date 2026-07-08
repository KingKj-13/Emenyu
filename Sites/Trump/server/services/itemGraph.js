'use strict';
// Phase 4 (Recommendation Engine V2) — unified Item Relationship Graph reader,
// per knowledge/item_graph.json (spec section 4.7). Loads the STATIC edges
// (pairs_with / upgrade_of / add_on_to / follows, extracted from
// trump_hero_pairings.json + the journey course sequence) and layers the one
// dynamic edge type — shares_context_with — on top via marketBasket.js's
// existing live order-history co-occurrence, exactly as the spec allows
// ("items that frequently appear together... via analytics").
//
// This does not replace heroPairings.js (which stays the tested, authoritative
// source for the actual pairing/upgrade LOGIC used by the live engine) — it
// is a read-only, spec-shaped view over the same authored content, usable for
// second-order traversal (e.g. ribeye -> Cabernet -> malva pudding -> espresso)
// that no single existing service currently performs.

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.join(__dirname, '..', '..', 'knowledge', 'item_graph.json');

function lc(v) { return String(v == null ? '' : v).toLowerCase(); }

function loadGraph(file = DEFAULT_FILE) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(data.edges) ? data.edges : [];
  } catch (error) {
    return [];
  }
}

function createItemGraph({ file, marketBasket = null } = {}) {
  const edges = loadGraph(file);

  const bySource = new Map();
  const byTarget = new Map();
  edges.forEach(edge => {
    const s = lc(edge.source);
    const t = lc(edge.target);
    if (!bySource.has(s)) bySource.set(s, []);
    bySource.get(s).push(edge);
    if (!byTarget.has(t)) byTarget.set(t, []);
    byTarget.get(t).push(edge);
  });

  // All static edges touching `name` (as source OR target), optionally
  // filtered to one edge type. Matches on substring so a specific bottle name
  // (e.g. "Nederburg Cabernet Sauvignon") still resolves the "Cabernet"-style
  // varietal edges authored against the dish.
  function edgesFor(name, type = null) {
    const key = lc(name);
    const out = [];
    for (const [source, list] of bySource) {
      if (key.includes(source) || source.includes(key)) out.push(...list);
    }
    for (const [target, list] of byTarget) {
      if (key.includes(target) || target.includes(key)) out.push(...list.filter(e => !out.includes(e)));
    }
    return type ? out.filter(e => e.type === type) : out;
  }

  function pairsWith(dishName) { return edgesFor(dishName, 'pairs_with'); }
  function upgradeOf(dishName) { return edgesFor(dishName, 'upgrade_of'); }
  function addOnsFor(dishName) { return edgesFor(dishName, 'add_on_to'); }
  function follows(courseName) { return edgesFor(courseName, 'follows'); }

  // Live, analytics-derived shares_context_with — delegates to marketBasket's
  // existing computeOrderedTogether() rather than persisting a second graph.
  function sharesContextWith(cart, orderRecords, menuContext, opts = {}) {
    if (!marketBasket || typeof marketBasket.computeOrderedTogether !== 'function') return [];
    return marketBasket.computeOrderedTogether(cart, orderRecords, menuContext, opts);
  }

  // Second-order traversal: from a starting dish, walk pairs_with then follows
  // (e.g. ribeye -pairs_with-> Cabernet, ribeye -follows-> dessert -follows->
  // coffee) up to maxHops, returning a flat, deduped chain of edges.
  function secondOrder(startName, chainTypes = ['pairs_with', 'follows'], maxHops = 3) {
    const visited = new Set([lc(startName)]);
    const chain = [];
    let frontier = [startName];
    for (let hop = 0; hop < maxHops && frontier.length; hop++) {
      const next = [];
      for (const name of frontier) {
        for (const type of chainTypes) {
          for (const edge of edgesFor(name, type)) {
            const nextName = lc(edge.source) === lc(name) ? edge.target : edge.source;
            if (visited.has(lc(nextName))) continue;
            visited.add(lc(nextName));
            chain.push(edge);
            next.push(nextName);
          }
        }
      }
      frontier = next;
    }
    return chain;
  }

  return { edges, edgesFor, pairsWith, upgradeOf, addOnsFor, follows, sharesContextWith, secondOrder };
}

module.exports = { createItemGraph };
