/**

 * Meta WhatsApp Embedded Signup — tenant self-serve connect from Company Portal.

 */

import { getCompany } from "../tenants/companyService.js";

import {
    getPlatformWhatsAppIntegration,
    getWhatsAppIntegration,
} from "../tenants/integrationService.js";

import {
    applyEmbeddedSignupIntegration,
    activatePlatformWhatsAppIntegration,
    assessRuntimeReadiness,
    WHATSAPP_STATUS_ACTIVE,
} from "../tenants/platformWhatsAppIntegrationService.js";

import { logInfo, logError } from "./integrationLogger.js";
import { getMetaGraphVersion } from "./metaGraphVersion.js";
import { mapEmbeddedSignupError } from "./metaEmbeddedSignupMessages.js";

/** Prevent duplicate concurrent embedded signup for the same tenant. */
const embeddedSignupInFlight = new Set();

import {

    exchangeEmbeddedSignupCode,

    verifyEmbeddedSignupAssets,

} from "./metaEmbeddedSignupGraph.js";



function platformError(message, status = 400) {

    const err = new Error(message);

    err.status = status;

    return err;

}



export function getEmbeddedSignupPublicConfig() {

    const appId = String(process.env.META_APP_ID || process.env.FB_APP_ID || "").trim();

    const configId = String(

        process.env.WHATSAPP_EMBEDDED_CONFIG_ID ||

            process.env.META_WHATSAPP_CONFIGURATION_ID ||

            ""

    ).trim();

    const graphVersion = getMetaGraphVersion();

    const enabled = Boolean(appId && configId);



    return {

        enabled,

        appId: enabled ? appId : null,

        configId: enabled ? configId : null,

        graphVersion,

        platformTokenConfigured: Boolean(process.env.WHATSAPP_TOKEN),

        oauthDomainHint: "https://ziricai.com",

    };

}



function normalizeEmbeddedPayload(body = {}) {

    const data = body.data && typeof body.data === "object" ? body.data : body;

    const phoneNumberId = String(

        data.phoneNumberId ||

            data.phone_number_id ||

            body.phoneNumberId ||

            body.phone_number_id ||

            ""

    ).trim();

    const businessAccountId = String(

        data.wabaId ||

            data.waba_id ||

            data.businessAccountId ||

            data.business_account_id ||

            body.wabaId ||

            body.waba_id ||

            ""

    ).trim();

    const displayPhoneNumber =

        data.displayPhoneNumber ||

        data.display_phone_number ||

        body.displayPhoneNumber ||

        body.display_phone_number ||

        null;

    const code = String(body.code || data.code || "").trim() || null;



    return { phoneNumberId, businessAccountId, displayPhoneNumber, code };

}



function maskDisplayPhone(phone) {

    if (!phone) return null;

    const digits = String(phone).replace(/\D/g, "");

    if (digits.length < 6) return String(phone);

    return `${String(phone).slice(0, 3)}···${digits.slice(-4)}`;

}



function buildSafeConnectionResponse(result, verification, runtime) {

    const sanitized = result?.integration || result;

    const readiness =
        runtime?.runtimeReady != null ? runtime : { runtimeReady: false, missing: [] };

    return {

        integration: sanitized,

        runtimeReady: readiness.runtimeReady,

        missing: readiness.missing || [],

        connection: {

            status: sanitized?.status || "pending_configuration",

            displayPhone: sanitized?.displayPhoneNumber || verification?.displayPhoneNumber || null,

            displayPhoneMasked: maskDisplayPhone(

                sanitized?.displayPhoneNumber || verification?.displayPhoneNumber

            ),

            businessName:

                sanitized?.verifiedBusinessName ||

                verification?.verifiedBusinessName ||

                verification?.wabaName ||

                null,

            wabaConnected: Boolean(sanitized?.businessAccountId || verification?.wabaWebhookSubscribed),

            wabaId: sanitized?.businessAccountId ? `···${String(sanitized.businessAccountId).slice(-6)}` : null,

            verifiedAt: sanitized?.embeddedSignupCompletedAt || null,

        },

        message: runtime.runtimeReady

            ? "WhatsApp is connected."

            : "WhatsApp saved — additional platform activation may be required.",

    };

}



async function resolveAccessTokenForSignup(code) {

    if (code) {

        const exchanged = await exchangeEmbeddedSignupCode(code);

        return { accessToken: exchanged.accessToken, credentialsSource: "tenant" };

    }



    const platformToken = String(process.env.WHATSAPP_TOKEN || "").trim();

    if (platformToken) {

        return { accessToken: platformToken, credentialsSource: "env" };

    }



    throw platformError(

        "Missing Meta authorization code and platform WHATSAPP_TOKEN is not configured",

        400

    );

}



/**

 * Persist tenant WhatsApp integration after Meta Embedded Signup completes.

 * @param {string} companyId

 * @param {object} body

 */

export async function completeEmbeddedSignupForTenant(companyId, body = {}) {

    if (embeddedSignupInFlight.has(companyId)) {

        throw platformError(

            "WhatsApp signup is already processing for this workspace. Wait a few seconds and refresh Integrations.",

            409

        );

    }

    embeddedSignupInFlight.add(companyId);

    try {

        const company = await getCompany(companyId);

        if (!company) {

            throw platformError("Company not found", 404);

        }



        const { phoneNumberId, businessAccountId, displayPhoneNumber: fromClient, code } =

            normalizeEmbeddedPayload(body);

        const existing = await getWhatsAppIntegration(companyId);

        if (

            existing?.status === WHATSAPP_STATUS_ACTIVE &&

            existing.phoneNumberId &&

            String(existing.phoneNumberId) === phoneNumberId

        ) {

            const readiness = assessRuntimeReadiness(existing);

            return buildSafeConnectionResponse(

                { integration: await getPlatformWhatsAppIntegration(companyId) },

                { displayPhoneNumber: existing.displayPhoneNumber },

                readiness

            );

        }



        if (!phoneNumberId) {

            throw platformError(

                "Meta did not return a WhatsApp phone number ID. Complete every step in the Meta popup.",

                400

            );

        }



        const { accessToken, credentialsSource } = await resolveAccessTokenForSignup(code);



        const verification = await verifyEmbeddedSignupAssets({

            accessToken,

            phoneNumberId,

            wabaId: businessAccountId || null,

        });



        const displayPhoneNumber =

            fromClient || verification.displayPhoneNumber || null;



        const saved = await applyEmbeddedSignupIntegration(companyId, {

            phoneNumberId,

            businessAccountId: businessAccountId || null,

            displayPhoneNumber,

            verifiedBusinessName: verification.verifiedBusinessName || verification.wabaName || null,

            credentialsSource,

            accessToken: credentialsSource === "tenant" ? accessToken : undefined,

            embeddedSignupCompletedAt: new Date().toISOString(),

        });



        let activation;

        try {

            activation = await activatePlatformWhatsAppIntegration(companyId, {

                acknowledgeEnvCredentials: credentialsSource === "env",

            });

        } catch (err) {

            if (err.status === 422) {

                logError("whatsapp", companyId, "Embedded signup saved — activation pending", {

                    error: err.message,

                    phoneNumberId,

                });

                const integration = await getPlatformWhatsAppIntegration(companyId);

                const readiness = assessRuntimeReadiness(integration);

                return buildSafeConnectionResponse(

                    { integration },

                    verification,

                    readiness

                );

            }

            throw err;

        }



        logInfo("whatsapp", companyId, "Embedded signup completed", {

            phoneNumberId,

            credentialsSource,

            runtimeReady: activation.runtimeReady,

        });



        return buildSafeConnectionResponse(activation, verification, activation);

    } catch (err) {

        if (!err.userMessage) {

            err.userMessage = mapEmbeddedSignupError(err);

        }

        throw err;

    } finally {

        embeddedSignupInFlight.delete(companyId);

    }

}



export function toEmbeddedSignupHttpError(err) {

    return {

        status: err.status || 500,

        body: {

            error: err.userMessage || mapEmbeddedSignupError(err),

            code: err.code || "EMBEDDED_SIGNUP_FAILED",

        },

    };

}


