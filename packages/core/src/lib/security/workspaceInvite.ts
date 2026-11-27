import { createInviteToken } from "./inviteToken";

const INVITE_DAYS = 7;

export function inviteExpiresAt(now: Date = new Date()): Date {
    const expires = new Date(now.getTime());
    expires.setUTCDate(expires.getUTCDate() + INVITE_DAYS);
    return expires;
}

/**
 * One-time workspace invite. The token comes from createInviteToken.
 * Acceptance marks the row accepted, so the same link cannot be used twice.
 */
export function buildWorkspaceInviteLink(origin: string, token: string = createInviteToken()): string {
    const base = origin.replace(/\/$/, "");
    const url = new URL("/auth/accept-invite", `${base}/`);
    url.searchParams.set("token", token);
    return url.toString();
}
