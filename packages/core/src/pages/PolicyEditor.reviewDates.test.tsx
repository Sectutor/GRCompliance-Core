import { forwardRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  update: vi.fn(async () => ({ success: true })),
  requestReview: vi.fn(async () => ({ success: true })),
}));

const policyFixture = vi.hoisted(() => ({
  clientPolicy: {
    id: 7,
    name: "Access Control",
    content: "<p>Hello</p>",
    status: "draft",
    owner: "owner@example.com",
    approvalStatus: "pending",
    reviewDueDate: "2026-11-01T00:00:00.000Z",
    nextReviewDate: "2027-10-21T00:00:00.000Z",
    reviewers: [],
    updatedAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  },
  clientName: "Latore LTD",
}));

vi.mock("@/lib/trpc", () => {
  const queries: Record<string, unknown> = {
    "clientPolicies.get": { data: policyFixture, isLoading: false, refetch: vi.fn() },
    "clientPolicies.history": { data: [], isLoading: false, refetch: vi.fn() },
    "clientPolicies.getLinkedRisks": { data: [], isLoading: false, refetch: vi.fn() },
    "clientPolicies.getLinkedControls": { data: [], isLoading: false, refetch: vi.fn() },
    "clientPolicies.activity": { data: [], isLoading: false, refetch: vi.fn() },
    "risks.getAll": { data: [], isLoading: false, refetch: vi.fn() },
    "clientControls.list": { data: [], isLoading: false, refetch: vi.fn() },
    "clients.get": { data: { name: "Latore LTD" }, isLoading: false, refetch: vi.fn() },
    "users.listWorkspaceMembers": {
      data: [{ id: 3, name: "Riley Chen", email: "riley@example.com" }],
      isLoading: false,
      refetch: vi.fn(),
    },
    "policyManagement.getAssignments": { data: [], isLoading: false, refetch: vi.fn() },
  };

  const mutations: Record<string, ReturnType<typeof vi.fn>> = {
    "clientPolicies.update": calls.update,
    "clientPolicies.requestReview": calls.requestReview,
  };

  function procedure(path: string) {
    return new Proxy({}, {
      get(_target, prop) {
        if (prop === "useQuery") {
          return () => queries[path] ?? { data: [], isLoading: false, refetch: vi.fn() };
        }
        if (prop === "useMutation") {
          return () => ({
            mutateAsync: mutations[path] ?? vi.fn(async () => ({})),
            mutate: vi.fn(),
            isPending: false,
          });
        }
        if (typeof prop === "symbol") return undefined;
        return procedure(path ? `${path}.${String(prop)}` : String(prop));
      },
    });
  }

  return {
    trpc: new Proxy({}, {
      get(_target, prop) {
        if (prop === "useContext" || prop === "useUtils") return () => ({});
        if (typeof prop === "symbol") return undefined;
        return procedure(String(prop));
      },
    }),
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, email: "alex@example.com", name: "Alex Morgan" }, loading: false }),
}));

vi.mock("wouter", () => ({
  useParams: () => ({ id: "1", policyId: "7" }),
  useLocation: () => ["/clients/1/policies/7", vi.fn()],
  Link: ({ children }: { children: unknown }) => <a>{children}</a>,
}));

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: unknown }) => <div>{children}</div>,
}));

vi.mock("@/components/RichTextEditor", () => ({
  default: forwardRef(function RichTextEditorMock() {
    return <div data-testid="editor" />;
  }),
}));

vi.mock("@/components/PageGuide", () => ({ PageGuide: () => null }));
vi.mock("@/components/policy/PolicyLinter", () => ({ default: () => null }));
vi.mock("@/components/policy/AiRewriteDialog", () => ({ AiRewriteDialog: () => null }));
vi.mock("@/components/policy/DistributionDialog", () => ({ DistributionDialog: () => null }));
vi.mock("@/components/CommentsSection", () => ({ CommentsSection: () => null }));
vi.mock("@/components/ControlDetailsDialog", () => ({ default: () => null }));
vi.mock("@/components/risk/RiskDetailsDialog", () => ({ RiskDetailsDialog: () => null }));
vi.mock("@/registry", () => ({ Slot: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), promise: vi.fn() } }));

import PolicyEditor from "./PolicyEditor";

describe("PolicyEditor review dates", () => {
  beforeEach(() => {
    calls.update.mockClear();
    calls.requestReview.mockClear();
  });

  it("edits the next-review date and the review-request due date separately", async () => {
    render(<PolicyEditor id="1" policyId="7" />);

    const nextReview = await screen.findByLabelText("Review Date");
    expect(nextReview).toHaveValue("2027-10-21");

    const save = screen.getByRole("button", { name: "Save Changes" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.change(nextReview, { target: { value: "2028-01-01" } });
    fireEvent.click(save);

    await waitFor(() => expect(calls.update).toHaveBeenCalled());
    const saved = calls.update.mock.calls[0][0];
    expect(saved.nextReviewDate).toBe("2028-01-01");
    expect(saved).not.toHaveProperty("reviewDueDate");
    expect(saved).not.toHaveProperty("dueDate");

    fireEvent.click(screen.getByRole("button", { name: "Request Review" }));
    const dueDate = await screen.findByLabelText("Due Date");
    expect(dueDate).toHaveValue("2026-11-01");
    expect(screen.getByLabelText("Review Date")).toHaveValue("2028-01-01");

    fireEvent.change(dueDate, { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("Riley Chen"));
    fireEvent.click(screen.getByRole("button", { name: "Send Request" }));

    await waitFor(() => expect(calls.requestReview).toHaveBeenCalled());
    const requested = calls.requestReview.mock.calls[0][0];
    expect(requested.reviewers).toEqual(["3"]);
    expect(requested).not.toHaveProperty("dueDate");
    expect(requested).not.toHaveProperty("nextReviewDate");
    expect(screen.getByLabelText("Review Date")).toHaveValue("2028-01-01");
  });
});
