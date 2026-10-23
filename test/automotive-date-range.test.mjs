import assert from "node:assert/strict";
import test from "node:test";

import {
    parseAutomotiveDashboardDateRange,
    isDayInRange,
} from "../services/automotive/automotiveDateRange.js";
test("parseAutomotiveDashboardDateRange defaults and validates", () => {
    const range = parseAutomotiveDashboardDateRange({}, Date.parse("2026-10-22T12:00:00.000Z"));
    assert.equal(range.to, "2026-10-22");
    assert.equal(range.timezonePolicy, "UTC");
    assert.throws(() => parseAutomotiveDashboardDateRange({ from: "bad" }), /Invalid from/);
    assert.throws(() => parseAutomotiveDashboardDateRange({ from: "2026-10-22", to: "2026-10-01" }), /before/);
});

test("isDayInRange inclusive", () => {
    assert.equal(isDayInRange("2026-10-15", "2026-10-01", "2026-10-31"), true);
    assert.equal(isDayInRange("2026-09-30", "2026-10-01", "2026-10-31"), false);
});
