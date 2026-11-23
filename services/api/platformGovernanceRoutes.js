/**
 * MC-PO — Mission Control platform governance APIs.
 */
import { requirePlatformAccess } from "../auth/platformAuth.js";
import { requirePlatformPermission, PLATFORM_PERMISSIONS as PP } from "../auth/platformRbac.js";
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { getPlatformCommandOverview } from "../platformGovernance/platformCommandOverviewService.js";
import { getConsumerGrowthOverview } from "../platformGovernance/consumerCensusService.js";
import { getRs02PlatformOverview, getRs02ConsoleRows } from "../platformGovernance/rs02OverviewService.js";
import { listConsumersForPlatform, getConsumerDetailForPlatform } from "../platformGovernance/consumerDirectoryService.js";
import { getPlatformActivityOverview } from "../platformGovernance/platformEventService.js";
import {
    listConsumerSafetyCases,
    getConsumerSafetyCase,
    createConsumerSafetyCase,
    decideConsumerSafetyCase,
} from "../platformGovernance/consumerSafetyService.js";
import { getSafetyOverview } from "../platformGovernance/consumerSafetyDetectionService.js";
import {
    listPlatformAnnouncements,
    createPlatformAnnouncement,
    updatePlatformAnnouncement,
} from "../platformGovernance/platformAnnouncementService.js";
import { getSarahAppMonitorOverview, ingestSarahAppTelemetry } from "../platformGovernance/sarahAppTelemetryService.js";
import { getOrganisationOversightOverview } from "../platformGovernance/orgOversightService.js";
import { listPlatformAdminAudit } from "../platformGovernance/platformAdminAuditService.js";

function actorUid(req) {
    return req.platformAuth?.uid || req.auth?.uid || "platform_api_key";
}

/**
 * @param {import('express').Express} app
 */
export function mountPlatformGovernanceRoutes(app) {
    app.get("/api/operations/platform-command-overview", requirePlatformAccess(), async (req, res) => {
        try {
            const period = req.query.period || "30d";
            res.json(await getPlatformCommandOverview({ period }));
        } catch (err) {
            console.error("[api/operations/platform-command-overview]", err.message);
            res.status(500).json({ error: err.message || "Failed to load command overview" });
        }
    });

    const gov = "/api/platform/governance";

    app.get(`${gov}/consumers`, requirePlatformPermission(PP.CONSUMERS_READ), async (req, res) => {
        try {
            res.json({
                ok: true,
                data: await listConsumersForPlatform({
                    q: req.query.q,
                    limit: req.query.limit,
                    cursor: req.query.cursor,
                }),
            });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    app.get(`${gov}/consumers/:uid`, requirePlatformPermission(PP.CONSUMERS_READ), async (req, res) => {
        try {
            res.json({ ok: true, data: await getConsumerDetailForPlatform(req.params.uid) });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    app.get(`${gov}/activity/overview`, requirePlatformPermission(PP.ANALYTICS_READ), async (req, res) => {
        try {
            res.json({ ok: true, data: await getPlatformActivityOverview({ days: req.query.days }) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get(`${gov}/safety/overview`, requirePlatformPermission(PP.SAFETY_READ), async (_req, res) => {
        try {
            res.json({ ok: true, data: await getSafetyOverview() });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get(`${gov}/safety/cases`, requirePlatformPermission(PP.SAFETY_READ), async (req, res) => {
        try {
            res.json({ ok: true, data: { cases: await listConsumerSafetyCases({ status: req.query.status }) } });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get(`${gov}/safety/cases/:caseId`, requirePlatformPermission(PP.SAFETY_READ), async (req, res) => {
        try {
            res.json({ ok: true, data: await getConsumerSafetyCase(req.params.caseId) });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    app.post(`${gov}/safety/cases`, requirePlatformPermission(PP.SAFETY_DECIDE), async (req, res) => {
        try {
            const row = await createConsumerSafetyCase({ ...req.body, actorUid: actorUid(req) });
            res.status(201).json({ ok: true, data: row });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    app.post(`${gov}/safety/cases/:caseId/decision`, requirePlatformPermission(PP.SAFETY_DECIDE), async (req, res) => {
        try {
            const row = await decideConsumerSafetyCase(req.params.caseId, { ...req.body, actorUid: actorUid(req) });
            res.json({ ok: true, data: row });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    app.get(`${gov}/rs02/console`, requirePlatformPermission(PP.REVENUE_READ), async (req, res) => {
        try {
            const [overview, console] = await Promise.all([
                getRs02PlatformOverview({ period: req.query.period || "30d" }),
                getRs02ConsoleRows({ limit: req.query.limit }),
            ]);
            res.json({ ok: true, data: { overview, ...console } });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get(`${gov}/orgs/overview`, requirePlatformPermission(PP.ORGS_READ), async (req, res) => {
        try {
            res.json({ ok: true, data: await getOrganisationOversightOverview() });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get(`${gov}/announcements`, requirePlatformPermission(PP.COMMS_READ), async (req, res) => {
        try {
            res.json({ ok: true, data: { announcements: await listPlatformAnnouncements() } });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post(`${gov}/announcements`, requirePlatformPermission(PP.COMMS_PUBLISH), async (req, res) => {
        try {
            const row = await createPlatformAnnouncement(req.body, actorUid(req));
            res.status(201).json({ ok: true, data: row });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    app.patch(`${gov}/announcements/:id`, requirePlatformPermission(PP.COMMS_PUBLISH), async (req, res) => {
        try {
            const row = await updatePlatformAnnouncement(req.params.id, req.body, actorUid(req));
            res.json({ ok: true, data: row });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    app.get(`${gov}/app-monitor/overview`, requirePlatformPermission(PP.MONITOR_READ), async (req, res) => {
        try {
            res.json({ ok: true, data: await getSarahAppMonitorOverview({ days: req.query.days }) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get(`${gov}/audit`, requirePlatformPermission(PP.AUDIT_READ), async (req, res) => {
        try {
            res.json({ ok: true, data: { entries: await listPlatformAdminAudit({ limit: req.query.limit }) } });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get(`${gov}/growth/snapshot`, requirePlatformPermission(PP.ANALYTICS_READ), async (req, res) => {
        try {
            res.json({ ok: true, data: await getConsumerGrowthOverview({ period: req.query.period || "30d" }) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/platform/telemetry/sarah-app", requireConsumerScope(), async (req, res) => {
        try {
            const uid = req.consumerAuth.uid;
            const result = await ingestSarahAppTelemetry(uid, req.body || {});
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}
