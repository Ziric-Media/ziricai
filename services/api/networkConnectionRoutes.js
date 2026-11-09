/**
 * SNET-07 — relationships API (v1).
 *   Consumer:
 *     GET  /api/network/v1/connections?state=
 *     GET  /api/network/v1/connections/:snId                 → { state: "none" | ... }
 *     POST /api/network/v1/connections   { snId, action, grantId? }
 *          action: discover | follow | unfollow | subscribe | unsubscribe | request_connection |
 *                  cancel_request | disconnect | block | unblock
 *     GET  /api/network/v1/my-organisations                   → { organisations[], counts }   (Gate 2)
 *     PUT  /api/network/v1/my-organisations/:snId/preferences { prefs: { notifications, announcements, reminders } }
 *     GET  /api/network/v1/my-updates?limit=                  → { updates[], organisations, delivery: "pull" }   (Gate 6)
 *     GET  /api/network/v1/my-notifications?limit=&unread=1   → { notifications[], unread, delivery: "in_app" }   (Phase 2.0)
 *     POST /api/network/v1/my-notifications/read { ids?: string[], all?: boolean } → { updated, unread }   (Phase 2.0)
 *     POST /api/network/v1/my-push-devices { token, consent?, platform? } → register FCM token (Phase 2.1)
 *   Tenant (member; writes need canManageNetwork) — pseudonymous:
 *     GET/POST /api/network/v1/orgs/:companyId/subscriber-events   (Gate 5/6 event log; Phase 2.0 also writes in-app notifications; no device push)
 *     GET  /api/network/v1/orgs/:companyId/connections?state=
 *     POST /api/network/v1/orgs/:companyId/connections/:connectionId/:action   accept | decline | disconnect | block | unblock
 */
import { requireConsumerScope } from "../auth/consumerAuth.js";
import { defaultAuthorize } from "./networkListingRoutes.js";
import {
    applyBusinessAction,
    applyConsumerAction,
    BUSINESS_ACTIONS,
    CONSUMER_ACTIONS,
    getConnectionStatus,
    listConnectionsForOrg,
    listConnectionsForUser,
} from "../network/connectionService.js";
import { listMyOrganisations, updateMyOrganisationPreferences } from "../network/myOrganisationsService.js";
import { listSubscriberEvents, recordSubscriberEvent } from "../network/subscriberEventService.js";
import { listUpdatesForUser } from "../network/subscriberUpdatesService.js";
import { listNotificationsForUser, markNotificationsRead } from "../network/notificationService.js";
import { registerPushDevice } from "../network/pushDeviceService.js";

function fail(res, err, fallbackCode) {
    res.status(err.status || 500).json({
        ok: false,
        error: { code: err.code || fallbackCode, message: err.message || "Request failed" },
    });
}

/**
 * @param {import('express').Express} app
 * @param {{ consumerGuard?: Function, authorize?: Function }} [deps] test seams
 */
export function mountNetworkConnectionRoutes(app, deps = {}) {
    const consumerGuard = deps.consumerGuard || requireConsumerScope();
    const authorize = deps.authorize || defaultAuthorize;

    app.get("/api/network/v1/connections", consumerGuard, async (req, res) => {
        try {
            const connections = await listConnectionsForUser(req.consumerAuth.uid, {
                state: String(req.query.state || ""),
                limit: req.query.limit,
            });
            res.json({ ok: true, data: { connections, actions: CONSUMER_ACTIONS } });
        } catch (err) {
            fail(res, err, "CONNECTION_LIST_FAILED");
        }
    });

    app.get("/api/network/v1/connections/:snId", consumerGuard, async (req, res) => {
        try {
            res.json({ ok: true, data: { connection: await getConnectionStatus(req.consumerAuth.uid, String(req.params.snId || "")) } });
        } catch (err) {
            fail(res, err, "CONNECTION_READ_FAILED");
        }
    });

    app.post("/api/network/v1/connections", consumerGuard, async (req, res) => {
        try {
            const body = req.body || {};
            const connection = await applyConsumerAction(
                req.consumerAuth.uid,
                String(body.snId || ""),
                String(body.action || ""),
                { grantId: body.grantId ? String(body.grantId) : undefined }
            );
            res.json({ ok: true, data: { connection } });
        } catch (err) {
            fail(res, err, "CONNECTION_ACTION_FAILED");
        }
    });

    // Gate 2 — My Organisations (SUB-01): relationships joined to public directory cards + channel preferences.
    app.get("/api/network/v1/my-organisations", consumerGuard, async (req, res) => {
        try {
            res.json({ ok: true, data: await listMyOrganisations(req.consumerAuth.uid) });
        } catch (err) {
            fail(res, err, "MY_ORGANISATIONS_FAILED");
        }
    });

    app.put("/api/network/v1/my-organisations/:snId/preferences", consumerGuard, async (req, res) => {
        try {
            const data = await updateMyOrganisationPreferences(req.consumerAuth.uid, String(req.params.snId || ""), req.body?.prefs || {});
            res.json({ ok: true, data });
        } catch (err) {
            fail(res, err, "MY_ORGANISATIONS_PREFS_FAILED");
        }
    });

    // Gate 6 — subscriber updates (pull): the consumer's feed built from the event log of the organisations they subscribed to.
    app.get("/api/network/v1/my-updates", consumerGuard, async (req, res) => {
        try {
            res.json({ ok: true, data: await listUpdatesForUser(req.consumerAuth.uid, { limit: req.query.limit }) });
        } catch (err) {
            fail(res, err, "MY_UPDATES_FAILED");
        }
    });

    // Phase 2.0/2.1 — in-app notifications (+ optional FCM when token registered).
    app.get("/api/network/v1/my-notifications", consumerGuard, async (req, res) => {
        try {
            const unreadOnly = ["1", "true"].includes(String(req.query.unread || "").toLowerCase());
            res.json({ ok: true, data: await listNotificationsForUser(req.consumerAuth.uid, { limit: req.query.limit, unreadOnly }) });
        } catch (err) {
            fail(res, err, "MY_NOTIFICATIONS_FAILED");
        }
    });

    app.post("/api/network/v1/my-notifications/read", consumerGuard, async (req, res) => {
        try {
            const body = req.body || {};
            res.json({ ok: true, data: await markNotificationsRead(req.consumerAuth.uid, { ids: body.ids, all: body.all === true }) });
        } catch (err) {
            fail(res, err, "MY_NOTIFICATIONS_READ_FAILED");
        }
    });

    app.post("/api/network/v1/my-push-devices", consumerGuard, async (req, res) => {
        try {
            const body = req.body || {};
            const data = await registerPushDevice(req.consumerAuth.uid, {
                token: body.token,
                consent: body.consent,
                platform: body.platform,
            });
            res.status(201).json({ ok: true, data });
        } catch (err) {
            fail(res, err, "PUSH_DEVICE_REGISTER_FAILED");
        }
    });

    // Gate 5 — subscriber notification event log (Phase 2.0: also fans out to in-app notifications).
    app.get("/api/network/v1/orgs/:companyId/subscriber-events", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            await authorize(req, companyId, { write: false });
            res.json({ ok: true, data: { events: await listSubscriberEvents(companyId, { limit: req.query.limit }), delivery: "in_app" } });
        } catch (err) {
            fail(res, err, "SUBSCRIBER_EVENTS_FAILED");
        }
    });

    app.post("/api/network/v1/orgs/:companyId/subscriber-events", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const ctx = await authorize(req, companyId, { write: true });
            const event = await recordSubscriberEvent(companyId, req.body || {}, ctx?.uid ? `member:${ctx.uid}` : "business");
            res.status(201).json({ ok: true, data: { event } });
        } catch (err) {
            fail(res, err, "SUBSCRIBER_EVENT_FAILED");
        }
    });

    app.get("/api/network/v1/orgs/:companyId/connections", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            await authorize(req, companyId, { write: false });
            const connections = await listConnectionsForOrg(companyId, { state: String(req.query.state || ""), limit: req.query.limit });
            res.json({ ok: true, data: { connections, actions: BUSINESS_ACTIONS } });
        } catch (err) {
            fail(res, err, "CONNECTION_LIST_FAILED");
        }
    });

    app.post("/api/network/v1/orgs/:companyId/connections/:connectionId/:action", async (req, res) => {
        try {
            const companyId = String(req.params.companyId || "").trim();
            const ctx = await authorize(req, companyId, { write: true });
            const connection = await applyBusinessAction(
                companyId,
                String(req.params.connectionId || ""),
                String(req.params.action || ""),
                ctx?.uid ? `member:${ctx.uid}` : "business"
            );
            res.json({ ok: true, data: { connection } });
        } catch (err) {
            fail(res, err, "CONNECTION_ACTION_FAILED");
        }
    });
}
