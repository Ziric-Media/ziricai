/** @typedef {'DUPLICATE_REVIEW'|'REVIEW_NOT_FOUND'|'INVALID_REVIEW'|'REVIEW_REPOSITORY_UNAVAILABLE'|'REVIEW_NOT_ELIGIBLE'|'REVIEW_PERSISTENCE_FAILED'} MarketplaceReviewErrorCode */

export const DUPLICATE_REVIEW = "DUPLICATE_REVIEW";
export const REVIEW_NOT_FOUND = "REVIEW_NOT_FOUND";
export const INVALID_REVIEW = "INVALID_REVIEW";
export const REVIEW_REPOSITORY_UNAVAILABLE = "REVIEW_REPOSITORY_UNAVAILABLE";
export const REVIEW_NOT_ELIGIBLE = "REVIEW_NOT_ELIGIBLE";
export const REVIEW_PERSISTENCE_FAILED = "REVIEW_PERSISTENCE_FAILED";

export class MarketplaceReviewError extends Error {
    /**
     * @param {string} message
     * @param {MarketplaceReviewErrorCode} code
     */
    constructor(message, code) {
        super(message);
        this.name = "MarketplaceReviewError";
        this.code = code;
    }
}
