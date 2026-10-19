import { describe, it, expect, vi } from "vitest";

const state = vi.hoisted(() => ({ requireMfa: false }));

vi.mock("../../db", () => {
  return {
    getDb: async () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{ requireMfa: state.requireMfa }],
          }),
        }),
      }),
    }),
  };
});

import { requiresMFA } from "../trpc";

const guard = (requiresMFA as unknown as { _middlewares: Array<(opts: unknown) => Promise<unknown>> })._middlewares[0];

const member = { id: 1, role: "member", email: "member@example.com" };

describe("requiresMFA middleware", () => {
  it("allows when client does not require MFA", async () => {
    state.requireMfa = false;
    const result = await guard({
      ctx: { clientId: 1, aal: "aal1", user: member, req: {}, res: {} },
      path: "clients.update",
      type: "mutation",
      next: () => ({ ok: true }),
    });
    expect(result).toEqual({ ok: true });
  });

  it("blocks when client requires MFA and aal is aal1", async () => {
    state.requireMfa = true;
    await expect(
      guard({
        ctx: { clientId: 1, aal: "aal1", user: member, req: {}, res: {} },
        path: "clients.update",
        type: "mutation",
        next: () => ({ ok: true }),
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
