import { describe, expect, it } from "vitest";
import { employeeInWorkspace, raciAssignmentTarget } from "./raciAssignment";

describe("raciAssignmentTarget", () => {
    it("keeps a platform user assignment backward compatible", () => {
        expect(raciAssignmentTarget({ userId: 7 })).toEqual({ userId: 7, employeeId: null });
    });

    it("stores an employee without inventing a user id", () => {
        expect(raciAssignmentTarget({ employeeId: 15 })).toEqual({ userId: null, employeeId: 15 });
    });

    it("rejects a missing assignee and a double assignee", () => {
        expect(() => raciAssignmentTarget({})).toThrow(/platform user or a workspace employee/);
        expect(() => raciAssignmentTarget({ userId: 1, employeeId: 2 })).toThrow(/platform user or a workspace employee/);
    });
});

describe("employeeInWorkspace", () => {
    it("accepts only people who belong to the control's workspace", () => {
        expect(employeeInWorkspace({ clientId: 1 }, 1)).toBe(true);
        expect(employeeInWorkspace({ clientId: 2 }, 1)).toBe(false);
        expect(employeeInWorkspace(null, 1)).toBe(false);
    });
});
