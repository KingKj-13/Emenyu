'use strict';
// Phase 4 (Recommendation Engine V2) — canonical meal-state model, per
// knowledge/meal_states.json (EMenu Hospitality Intelligence v3 spec, section
// 2.1.2). This is a NEW, additive read of the same cart signals the two
// existing stage machines already use — it does NOT replace or alter
// recommendationRules.js's mealStage() (EMPTY/OPENING/MAIN/CLOSING) or
// recommendationScoring.js's nextJourneyStage() (drink/food/wine/upgrade/
// dessert/coffee/digestif/done), which stay exactly as they are so every
// existing tested call site keeps its current behaviour unchanged.
//
// New consumers (recommendationMemory, businessRules, candidateFilterPipeline)
// should use THIS module for the canonical 7-state name + allowed/forbidden
// recommendation types, rather than either legacy machine.

const fs = require('fs');
const path = require('path');
const classifier = require('./categoryClassifier');

const DEFAULT_FILE = path.join(__dirname, '..', '..', 'knowledge', 'meal_states.json');

function loadStates(file = DEFAULT_FILE) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(data.states) ? data.states : [];
  } catch (error) {
    return [];
  }
}

function itemType(it) {
  return (it && it.categoryType) || classifier.categoryType(it);
}

// Same signal set nextJourneyStage() already reads (hasDrink/hasFood/hasWine/
// hasDessert/hasCoffee/hasDigestif/upgrade), just mapped onto the spec's 7
// named states instead of the 8-step drink/food/wine/upgrade/... ladder.
function currentState(cart = [], menuByName = new Map(), { upgradeOffered = false, upgradeAvailable = false } = {}) {
  const items = (cart || [])
    .map(line => (menuByName && menuByName.get && menuByName.get(require('../utils/helpers').normalizeName(line && line.name))) || line)
    .filter(Boolean);

  const hasDrink = items.some(it => ['WINE', 'DRINK'].includes(itemType(it)));
  const hasFood = items.some(it => ['MAIN', 'STARTER', 'SUSHI'].includes(itemType(it)));
  const hasWine = items.some(it => itemType(it) === 'WINE');
  const hasDessert = items.some(it => itemType(it) === 'DESSERT');
  const hasCoffee = items.some(it => classifier.beverageKind(it) === 'HOT');
  const hasDigestif = items.some(it => ['spirit', 'port', 'amarula'].includes(it.tags?.drinkType));

  if (!hasDrink) return 'STATE_WAITING_FOR_DRINK';
  if (!hasFood) return 'STATE_FOOD_DECISION';
  if (!hasWine || (upgradeAvailable && !upgradeOffered)) return 'STATE_DURING_MAIN';
  if (!hasDessert) return 'STATE_POST_MAIN';
  if (!hasCoffee) return 'STATE_DESSERT_EATING';
  if (!hasDigestif) return 'STATE_COFFEE_EATING';
  return 'STATE_COMPLETE';
}

function createMealStateService({ file } = {}) {
  const states = loadStates(file);
  const byName = new Map(states.map(s => [s.name, s]));

  function getState(name) {
    return byName.get(name) || null;
  }

  function isAllowed(stateName, recType) {
    const state = getState(stateName);
    if (!state) return true; // fail-open: unknown state never blocks a suggestion
    return state.allowed_recommendation_types.includes(recType);
  }

  function isForbidden(stateName, recType) {
    const state = getState(stateName);
    if (!state) return false;
    return state.forbidden_recommendation_types.includes(recType);
  }

  return { states, getState, isAllowed, isForbidden, currentState };
}

module.exports = { createMealStateService, currentState };
