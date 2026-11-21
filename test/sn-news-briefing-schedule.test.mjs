#!/usr/bin/env node
import assert from "node:assert/strict";
import {
    isBriefingSlotDue,
    parseBriefingClock,
    slotsDueNow,
} from "../services/sarah/news/sarahNewsBriefingSchedule.js";

const profile = {
    briefings: { morning: true, lunch: true, evening: false },
    briefingTimes: { morning: "07:00", lunch: "12:30", evening: "18:30" },
};

assert.equal(parseBriefingClock("07:00"), 420);
assert.equal(isBriefingSlotDue("lunch", { briefings: { lunch: false } }, 120), false);

const morningUtcForSa = new Date("2026-01-15T05:10:00.000Z");
assert.equal(isBriefingSlotDue("morning", profile, 120, morningUtcForSa), true);

const lunchUtcForSa = new Date("2026-01-15T10:35:00.000Z");
assert.equal(isBriefingSlotDue("lunch", profile, 120, lunchUtcForSa), true);

const due = slotsDueNow(profile, 120, lunchUtcForSa);
assert.ok(due.includes("lunch"));

console.log("sn-news-briefing-schedule.test.mjs: ok", due.join(","));