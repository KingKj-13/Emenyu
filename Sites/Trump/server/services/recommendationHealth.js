'use strict';
// Pure chef-recommendation health analyzer (Phase 4, Task 4). No DB, no I/O — given
// the chef-recommendation rows and the menu items, it returns data-integrity issues.
// `scripts/reco-health.js` loads the rows from Postgres and runs this; the same
// function is exercised offline with fixtures (`reco:health --selftest`).
//
// Issue levels:
//   fail  — the recommendation cannot work (points at / from a non-existent item)
//   warn  — the recommendation works but is degraded or ambiguous

const CODES = {
  ORPHANED_SOURCE: 'orphaned_source',        // sourceItemId not in the menu
  MISSING_TARGET: 'missing_target',          // targetItemId not in the menu
  DISABLED_TARGET: 'disabled_target',        // target hidden / unavailable
  CIRCULAR_CHAIN: 'circular_chain',          // A → B and B → A (or longer cycle)
  INVALID_ROTATION_GROUP: 'invalid_rotation_group',
  DUPLICATE_PRIORITY: 'duplicate_priority'   // same source+recType+priority on different targets
};

function key(id) {
  return Number(id);
}

// items: [{ id, name, available?, visible? }]
// recommendations: [{ id, sourceItemId, targetItemId, recType, priority, rotationGroup,
//                     active, sourceName?, targetName? }]
function analyze({ recommendations = [], items = [] } = {}) {
  const issues = [];
  const add = (level, code, message, extra = {}) => issues.push({ level, code, message, ...extra });

  const itemById = new Map(items.map(it => [key(it.id), it]));
  const isDisabled = it => it && (it.available === false || it.visible === false);
  const nameOf = (rec, which) =>
    rec[`${which}Name`] || itemById.get(key(rec[`${which}ItemId`]))?.name || `#${rec[`${which}ItemId`]}`;

  // Only active rows participate in live recommendations; integrity checks consider
  // active rows (a disabled row pointing nowhere is harmless).
  const active = recommendations.filter(r => r.active !== false);

  // 1 & 5 — orphaned source / missing target.
  for (const r of active) {
    if (!itemById.has(key(r.sourceItemId))) {
      add('fail', CODES.ORPHANED_SOURCE, `Chef rec #${r.id}: source item ${r.sourceItemId} no longer exists.`, { recId: r.id });
    }
    if (!itemById.has(key(r.targetItemId))) {
      add('fail', CODES.MISSING_TARGET, `Chef rec #${r.id}: recommended item ${r.targetItemId} (${nameOf(r, 'target')}) no longer exists.`, { recId: r.id });
    }
  }

  // 2 — disabled target items (rec points at a hidden/sold-out dish).
  for (const r of active) {
    const target = itemById.get(key(r.targetItemId));
    if (target && isDisabled(target)) {
      add('warn', CODES.DISABLED_TARGET, `Chef rec #${r.id}: recommends "${nameOf(r, 'target')}" which is hidden or unavailable.`, { recId: r.id });
    }
  }

  // 3 — circular chains. Build a directed graph source → target over active recs
  // whose endpoints both exist, then detect any cycle (covers A→B→A and longer).
  const edges = new Map();
  for (const r of active) {
    if (!itemById.has(key(r.sourceItemId)) || !itemById.has(key(r.targetItemId))) continue;
    if (!edges.has(key(r.sourceItemId))) edges.set(key(r.sourceItemId), new Set());
    edges.get(key(r.sourceItemId)).add(key(r.targetItemId));
  }
  const cyclesFound = new Set();
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map();
  const stack = [];
  const dfs = node => {
    colour.set(node, GREY);
    stack.push(node);
    for (const next of edges.get(node) || []) {
      if (colour.get(next) === GREY) {
        // back-edge → cycle; record the involved nodes (sorted) once.
        const cycleSig = [...stack.slice(stack.indexOf(next)), next].sort((a, b) => a - b).join('-');
        if (!cyclesFound.has(cycleSig)) {
          cyclesFound.add(cycleSig);
          const names = [...stack.slice(stack.indexOf(next))].map(n => itemById.get(n)?.name || `#${n}`);
          add('warn', CODES.CIRCULAR_CHAIN, `Circular recommendation chain: ${names.join(' → ')} → ${names[0]}.`, { nodes: [...stack.slice(stack.indexOf(next))] });
        }
      } else if ((colour.get(next) || WHITE) === WHITE) {
        dfs(next);
      }
    }
    colour.set(node, BLACK);
    stack.pop();
  };
  for (const node of edges.keys()) {
    if ((colour.get(node) || WHITE) === WHITE) dfs(node);
  }

  // 4 — invalid rotation groups. A rotation group is meant to hold ≥2 interchangeable
  // members for the SAME source; flag single-member groups (no rotation effect) and
  // groups that span more than one source item (ambiguous).
  const groups = new Map();
  for (const r of active) {
    if (!r.rotationGroup) continue;
    if (!groups.has(r.rotationGroup)) groups.set(r.rotationGroup, []);
    groups.get(r.rotationGroup).push(r);
  }
  for (const [group, members] of groups) {
    if (members.length < 2) {
      add('warn', CODES.INVALID_ROTATION_GROUP, `Rotation group "${group}" has a single member — nothing to rotate.`, { rotationGroup: group });
    }
    const sources = new Set(members.map(m => key(m.sourceItemId)));
    if (sources.size > 1) {
      add('warn', CODES.INVALID_ROTATION_GROUP, `Rotation group "${group}" spans ${sources.size} different source items — rotation is ambiguous.`, { rotationGroup: group });
    }
  }

  // 6 — duplicate priority conflicts. Same (source, recType, priority) on different
  // targets that are NOT in the same rotation group → ambiguous ordering.
  const prio = new Map();
  for (const r of active) {
    const k = `${key(r.sourceItemId)}|${r.recType}|${r.priority}`;
    if (!prio.has(k)) prio.set(k, []);
    prio.get(k).push(r);
  }
  for (const [, rows] of prio) {
    if (rows.length < 2) continue;
    const distinctTargets = new Set(rows.map(r => key(r.targetItemId)));
    const groupsUsed = new Set(rows.map(r => r.rotationGroup || ''));
    const ungrouped = groupsUsed.has('') || groupsUsed.size > 1;
    if (distinctTargets.size > 1 && ungrouped) {
      const r = rows[0];
      add('warn', CODES.DUPLICATE_PRIORITY, `Source "${nameOf(r, 'source')}" has ${rows.length} ${r.recType} recommendations at priority ${r.priority} without a shared rotation group — ordering is ambiguous.`, { sourceItemId: r.sourceItemId, recType: r.recType, priority: r.priority });
    }
  }

  const fail = issues.filter(i => i.level === 'fail').length;
  const warn = issues.filter(i => i.level === 'warn').length;
  const byCode = {};
  for (const i of issues) byCode[i.code] = (byCode[i.code] || 0) + 1;

  return {
    ok: fail === 0,
    summary: { recommendations: recommendations.length, active: active.length, items: items.length, fail, warn, byCode },
    issues
  };
}

module.exports = { analyze, CODES };
