import assert from "node:assert/strict";
import { organisationQueryFromTask } from "../services/sarah/personal/personalSarahTaskNetworkMatch.js";

assert.equal(
    organisationQueryFromTask({
        meta: { govDepartmentName: "Department of Home Affairs", organisation: "DHA" },
    }),
    "Department of Home Affairs"
);

assert.equal(organisationQueryFromTask({ meta: { company: "Acme" } }), "Acme");

assert.equal(organisationQueryFromTask({}), "");

console.log("personal-sarah-task-network.test.mjs OK");