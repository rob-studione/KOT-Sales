#!/usr/bin/env node
/**
 * Unique-call KPI + Kanban Užbaigta defaults.
 *   node --import ./scripts/register-ts-path.mjs --experimental-strip-types scripts/verify-unique-call-kpi.mts
 */

import {
  defaultKanbanCompletedAction,
  kanbanCompletedActionsForMove,
} from "@/lib/crm/projectBoardConstants";
import { recordUniqueCallDay } from "@/lib/crm/uniqueCallKpi";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("verify-unique-call-kpi: FAILED", msg);
    process.exit(1);
  }
}

assert(defaultKanbanCompletedAction("Užbaigta", "Perskambinti") === "status_only", "done→callback default");
assert(defaultKanbanCompletedAction("Užbaigta", "Skambinti") === "status_only", "done→call default");
assert(defaultKanbanCompletedAction("Skambinti", "Perskambinti") === "call_not_answered", "call→callback default");
assert(defaultKanbanCompletedAction("Perskambinti", "Užbaigta") === "call_answered", "callback→done default");

const leavingOpts = kanbanCompletedActionsForMove("Užbaigta", "Perskambinti");
assert(!leavingOpts.includes("call_answered"), "no answered option leaving done");
assert(!leavingOpts.includes("call_not_answered"), "no not-answered option leaving done");
assert(leavingOpts.includes("status_only"), "status_only remains");

const acc = new Map();
recordUniqueCallDay(acc, "u1", "w1", "2026-08-17", false, true);
recordUniqueCallDay(acc, "u1", "w1", "2026-08-17", false, true);
recordUniqueCallDay(acc, "u1", "w1", "2026-08-17", true, false);
assert(acc.size === 1, "same card+day collapses");
const row = [...acc.values()][0];
assert(row.answered === true, "answered wins");
assert(row.notAnswered === true, "not-answered still recorded then dropped at count");

recordUniqueCallDay(acc, "u1", "w2", "2026-08-17", false, true);
assert(acc.size === 2, "other card is a second call");

console.log("verify-unique-call-kpi: ok");
