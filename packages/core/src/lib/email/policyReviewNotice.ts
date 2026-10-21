import { appLink } from "./appUrl";
import { escapeHtml, sanitizeEmailSubject } from "./escapeHtml";

export function policyPageUrl(
    clientId: number,
    policyId: number,
    env?: Record<string, string | undefined>,
): string {
    return appLink(`/clients/${clientId}/policies/${policyId}`, env);
}

function formatDueDate(dueDate: string): string | null {
    const parsed = new Date(dueDate);
    if (Number.isNaN(parsed.getTime())) return null;
    return escapeHtml(parsed.toLocaleDateString());
}

export function buildReviewRequestedEmail(input: {
    reviewerName: string | null;
    requesterName: string | null;
    policyName: string;
    dueDate?: string | null;
    message?: string | null;
    policyUrl: string;
}): { subject: string; html: string } {
    const policyName = escapeHtml(input.policyName);
    const requester = escapeHtml(input.requesterName?.trim() || "A team member");
    const greeting = escapeHtml(input.reviewerName?.trim() || "there");
    const due = input.dueDate ? formatDueDate(input.dueDate) : null;
    const message = input.message?.trim() ? escapeHtml(input.message) : null;
    const href = escapeHtml(input.policyUrl);

    const subject = sanitizeEmailSubject(`Review Requested: ${input.policyName}`) || "Review Requested";

    const html = `
                  <div style="font-family: sans-serif; color: #374151;">
                    <h2>Policy Review Requested</h2>
                    <p>Hello ${greeting},</p>
                    <p><strong>${requester}</strong> has requested that you review the following policy:</p>
                    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                      <p><strong>Policy:</strong> ${policyName}</p>
                      ${due ? `<p><strong>Due Date:</strong> ${due}</p>` : ""}
                      ${message ? `<p><strong>Message:</strong> ${message}</p>` : ""}
                    </div>
                    <p>Please log in to the GRCompliance dashboard to review and provide your feedback.</p>
                    <a href="${href}"
                       style="display: inline-block; background-color: #1c4d8d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; margin-top: 10px;">
                      View Policy
                    </a>
                  </div>
                `;

    return { subject, html };
}

export function buildReviewDecisionEmail(input: {
    policyName: string;
    decision: "approved" | "changes_requested";
    notes?: string | null;
    policyUrl: string;
}): { subject: string; html: string } {
    const policyName = escapeHtml(input.policyName);
    const decisionLabel = escapeHtml(input.decision.replace("_", " "));
    const notes = input.notes?.trim() ? escapeHtml(input.notes) : null;
    const href = escapeHtml(input.policyUrl);
    const approved = input.decision === "approved";

    const subject = sanitizeEmailSubject(`Policy Review Update: ${input.policyName}`) || "Policy Review Update";

    const html = `
                      <div style="font-family: sans-serif; color: #374151;">
                        <h2>Policy Review Decision</h2>
                        <p>A decision has been made on the policy: <strong>${policyName}</strong></p>
                        <div style="background-color: ${approved ? "#ecfdf5" : "#fef2f2"}; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid ${approved ? "#10b981" : "#ef4444"};">
                          <p><strong>Decision:</strong> <span style="font-weight: bold; color: ${approved ? "#059669" : "#dc2626"}; text-transform: uppercase;">${decisionLabel}</span></p>
                          ${notes ? `<p><strong>Notes/Feedback:</strong> ${notes}</p>` : ""}
                        </div>
                        <a href="${href}"
                           style="display: inline-block; background-color: #1c4d8d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">
                          View Policy
                        </a>
                      </div>
                    `;

    return { subject, html };
}
