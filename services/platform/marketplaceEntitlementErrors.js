/** @typedef {'ENTITLEMENT_REPOSITORY_UNAVAILABLE'|'INVALID_ENTITLEMENT'|'COMPANY_NOT_FOUND'|'PACK_NOT_FOUND'|'ENTITLEMENT_NOT_FOUND'} MarketplaceEntitlementErrorCode */

export const ENTITLEMENT_REPOSITORY_UNAVAILABLE = "ENTITLEMENT_REPOSITORY_UNAVAILABLE";
export const INVALID_ENTITLEMENT = "INVALID_ENTITLEMENT";
export const COMPANY_NOT_FOUND = "COMPANY_NOT_FOUND";
export const PACK_NOT_FOUND = "PACK_NOT_FOUND";
export const ENTITLEMENT_NOT_FOUND = "ENTITLEMENT_NOT_FOUND";

export class MarketplaceEntitlementError extends Error {
    /**
     * @param {string} message
     * @param {MarketplaceEntitlementErrorCode} code
     */
    constructor(message, code) {
        super(message);
        this.name = "MarketplaceEntitlementError";
        this.code = code;
    }
}
