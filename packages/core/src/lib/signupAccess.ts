/**
 * Self-hosted Core (AUTH_MODE=local) does not sell accounts.
 * Sign-up is off unless the operator sets GRC_ALLOW_SIGNUP.
 * An explicit flag wins over the default for either mode.
 */
export function signupIsEnabled(
    authMode: string | null | undefined,
    allowSignup: boolean | string | null | undefined,
): boolean {
    if (allowSignup === true || allowSignup === "true" || allowSignup === "1" || allowSignup === "yes") return true;
    if (allowSignup === false || allowSignup === "false" || allowSignup === "0" || allowSignup === "no") return false;
    return authMode !== "local";
}
