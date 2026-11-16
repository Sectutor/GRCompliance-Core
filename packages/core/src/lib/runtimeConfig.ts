/**
 * Marketing or analytics consent is off unless an operator sets
 * GRC_COOKIE_CONSENT=1 (written to window.__GRC_CONFIG__.cookieConsent)
 * or VITE_COOKIE_CONSENT=true at build time. Session and sign-in storage
 * is strictly necessary and does not use this flag.
 */
export function marketingConsentEnabled(cookieConsent: boolean | string | undefined | null): boolean {
    return cookieConsent === true || cookieConsent === "true" || cookieConsent === "1";
}

export function readMarketingConsentFlag(): boolean {
    if (typeof window !== "undefined" && window.__GRC_CONFIG__ && "cookieConsent" in window.__GRC_CONFIG__) {
        return marketingConsentEnabled(window.__GRC_CONFIG__.cookieConsent);
    }
    const baked = import.meta.env.VITE_COOKIE_CONSENT as string | undefined;
    return marketingConsentEnabled(baked);
}

export function isLocalAuthClient(): boolean {
    if (typeof window !== "undefined" && window.__GRC_CONFIG__?.authMode) {
        return window.__GRC_CONFIG__.authMode === "local";
    }
    return import.meta.env.VITE_AUTH_MODE === "local";
}

export function readSignupEnabled(): boolean {
    if (typeof window !== "undefined" && window.__GRC_CONFIG__ && "allowSignup" in window.__GRC_CONFIG__) {
        return window.__GRC_CONFIG__.allowSignup === true;
    }
    return import.meta.env.VITE_AUTH_MODE !== "local";
}
