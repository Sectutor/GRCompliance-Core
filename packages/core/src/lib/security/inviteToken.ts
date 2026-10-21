import { randomBytes } from "node:crypto";

/**
 * Unguessable invite token. 32 bytes, base64url, 43 characters,
 * which fits gap_questionnaire_requests.token (varchar 64).
 */
export function createInviteToken(): string {
    return randomBytes(32).toString("base64url");
}
