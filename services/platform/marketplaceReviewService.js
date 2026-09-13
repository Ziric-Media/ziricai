/**
 * Marketplace pack review submission — Model A (installed tenant only).
 */
import { getTenantMembership } from "../auth/authService.js";
import { resolvePackId } from "./marketplaceRegistry.js";
import { getInstall } from "./marketplaceInstallService.js";
import { getMarketplaceReviewRepository } from "./marketplaceReviewRepository.js";
import { toPublicMarketplaceReview } from "./marketplaceReviewModel.js";
import {
    MarketplaceReviewError,
    DUPLICATE_REVIEW,
    INVALID_REVIEW,
    REVIEW_NOT_ELIGIBLE,
    REVIEW_PERSISTENCE_FAILED,
} from "./marketplaceReviewErrors.js";

/**
 * @param {import('./marketplaceReviewErrors.js').MarketplaceReviewError} err
 */
export function mapMarketplaceReviewSubmitHttpStatus(err) {
    if (!(err instanceof MarketplaceReviewError)) {
        return { status: 500, code: "INTERNAL_ERROR", message: err?.message || "Review submission failed" };
    }
    switch (err.code) {
        case DUPLICATE_REVIEW:
            return { status: 409, code: err.code, message: err.message };
        case INVALID_REVIEW:
            return { status: 400, code: err.code, message: err.message };
        case REVIEW_NOT_ELIGIBLE:
            return { status: 403, code: err.code, message: err.message };
        case REVIEW_PERSISTENCE_FAILED:
            return { status: 503, code: err.code, message: err.message };
        default:
            return { status: 500, code: err.code || "INTERNAL_ERROR", message: err.message };
    }
}

async function resolveAuthorDisplayName(tenantCtx) {
    const { uid, companyId, profile, email } = tenantCtx;
    if (uid && companyId) {
        const membership = await getTenantMembership(uid, companyId);
        const fromMember = membership?.fullName?.trim();
        if (fromMember) return fromMember;
    }
    const fromProfile = (profile?.fullName || profile?.name || "").trim();
    if (fromProfile) return fromProfile;
    const mail = email || profile?.email;
    if (mail && mail.includes("@")) return mail.split("@")[0];
    return "Tenant member";
}

/**
 * @param {{ companyId: string|null, uid: string|null, isSuperAdmin?: boolean, profile?: object, email?: string|null }} tenantCtx
 * @param {{ packId: string, rating: number, title?: string, body?: string }} input
 * @param {{ getReviewRepository?: typeof getMarketplaceReviewRepository, getInstallRecord?: typeof getInstall }} [deps]
 */
export async function submitMarketplacePackReview(tenantCtx, input, deps = {}) {
    const getReviewRepository = deps.getReviewRepository ?? getMarketplaceReviewRepository;
    const getInstallRecord = deps.getInstallRecord ?? getInstall;

    const companyId = tenantCtx?.companyId;
    if (!companyId) {
        throw Object.assign(new Error("companyId is required"), { status: 400, code: "MISSING_COMPANY_ID" });
    }
    if (!tenantCtx?.uid && !tenantCtx?.isSuperAdmin) {
        throw Object.assign(new Error("Authentication required"), { status: 401, code: "UNAUTHORIZED" });
    }
    if (!input?.packId) {
        throw new MarketplaceReviewError("packId is required", INVALID_REVIEW);
    }

    const packId = resolvePackId(input.packId);
    const install = await getInstallRecord(companyId, packId);
    if (!install || install.status !== "installed") {
        const status = install?.status || "missing";
        throw new MarketplaceReviewError(
            `Review not allowed: Industry Pack install status is "${status}" (installed required)`,
            REVIEW_NOT_ELIGIBLE
        );
    }

    const authorUid = tenantCtx.uid;
    if (!authorUid) {
        throw new MarketplaceReviewError("Authenticated member uid is required to submit a review", INVALID_REVIEW);
    }

    const authorDisplayName = await resolveAuthorDisplayName(tenantCtx);
    const repo = await getReviewRepository();

    try {
        const result = await repo.createReview({
            companyId,
            packId,
            authorUid,
            authorDisplayName,
            rating: input.rating,
            title: input.title,
            body: input.body,
        });
        return {
            success: true,
            review: result.review,
            publicReview: toPublicMarketplaceReview(result.review),
        };
    } catch (err) {
        if (err instanceof MarketplaceReviewError && err.code === DUPLICATE_REVIEW) {
            throw err;
        }
        if (err instanceof MarketplaceReviewError) {
            throw err;
        }
        throw new MarketplaceReviewError(err?.message || "Failed to persist review", REVIEW_PERSISTENCE_FAILED);
    }
}
