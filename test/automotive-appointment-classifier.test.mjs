import assert from "node:assert/strict";
import test from "node:test";

import { isTestDriveAppointment } from "../services/automotive/automotiveAppointmentClassifier.js";

test("explicit appointmentType=test_drive is classified", () => {
    assert.equal(isTestDriveAppointment({ appointmentType: "test_drive", service: "Finance chat" }), true);
});

test("generic appointment without type or test-drive label is not classified", () => {
    assert.equal(
        isTestDriveAppointment({ appointmentType: "consultation", service: "Finance consultation" }),
        false
    );
    assert.equal(isTestDriveAppointment({ service: "Oil change and filter" }), false);
    assert.equal(isTestDriveAppointment({ title: "Latest drive news discussion" }), false);
});

test("documented service label heuristic for test drive", () => {
    assert.equal(isTestDriveAppointment({ service: "Test drive — Corolla" }), true);
    assert.equal(isTestDriveAppointment({ title: "Book test drive slot" }), true);
});
