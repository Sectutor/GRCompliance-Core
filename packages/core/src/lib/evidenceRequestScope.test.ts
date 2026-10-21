import { describe, expect, it } from "vitest";
import { evidenceRequestScope } from "./evidenceRequestScope";

describe("evidenceRequestScope", () => {
    it("keeps the control id when a workspace id is also sent", () => {
        expect(evidenceRequestScope({ clientId: 1, clientControlId: 4 })).toEqual({
            clientId: 1,
            clientControlId: 4,
        });
    });

    it("passes through a single filter and an empty query", () => {
        expect(evidenceRequestScope({ clientId: 1 })).toEqual({ clientId: 1 });
        expect(evidenceRequestScope({ clientControlId: 9 })).toEqual({ clientControlId: 9 });
        expect(evidenceRequestScope({})).toEqual({});
    });
});
