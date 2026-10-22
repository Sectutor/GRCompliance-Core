import { escapeHtml } from "./escapeHtml";

export function gapInviteHtml(input: {
    notes?: string | null;
    inviteUrl: string;
    expiresOn: string;
}): string {
    const notes = input.notes
        ? `<div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #ddd; margin: 20px 0;">${escapeHtml(input.notes)}</div>`
        : "";
    const url = escapeHtml(input.inviteUrl);
    const expiresOn = escapeHtml(input.expiresOn);

    return `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #1a1a1a;">Information Request</h2>
                <p>You have been requested to provide compliance information for a security assessment.</p>
                ${notes}
                <div style="margin: 32px 0; text-align: center;">
                  <a href="${url}" style="background-color: #000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Complete Questionnaire</a>
                </div>
                <p style="color: #666; font-size: 14px;"><strong>Expires:</strong> ${expiresOn}</p>
                <p style="color: #999; font-size: 12px;">Link: ${url}</p>
              </div>
            `;
}
