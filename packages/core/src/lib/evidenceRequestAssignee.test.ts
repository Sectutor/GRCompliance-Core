import { describe, expect, it } from "vitest";
import {
    decodeAssigneeChoice,
    evidenceRequestAssignee,
    evidenceRequestAssigneeLabel,
} from "./evidenceRequestAssignee";

describe("evidenceRequestAssignee", () => {
    it("keeps a platform user assignment on assignee_id", () => {
        expect(evidenceRequestAssignee({ assigneeId: 7 })).toEqual({
            assigneeId: 7,
            assigneeEmployeeId: null,
        });
    });

    it("stores an employee without inventing a user id", () => {
        expect(evidenceRequestAssignee({ assigneeEmployeeId: 15 })).toEqual({
            assigneeId: null,
            assigneeEmployeeId: 15,
        });
    });

    it("rejects a missing assignee and a double assignee", () => {
        expect(() => evidenceRequestAssignee({})).toThrow(/platform user or a workspace employee/);
        expect(() => evidenceRequestAssignee({ assigneeId: 1, assigneeEmployeeId: 2 })).toThrow(/platform user or a workspace employee/);
    });
});

describe("decodeAssigneeChoice", () => {
    it("reads the picker values for a person and a user", () => {
        expect(decodeAssigneeChoice("employee:4")).toEqual({ assigneeEmployeeId: 4 });
        expect(decodeAssigneeChoice("user:1")).toEqual({ assigneeId: 1 });
        expect(decodeAssigneeChoice("nope")).toBeNull();
    });
});

describe("evidenceRequestAssigneeLabel", () => {
    it("labels an employee and a user with the same words the picker uses", () => {
        expect(evidenceRequestAssigneeLabel({
            assigneeEmployeeId: 4,
            employeeFirst: "Charlie",
            employeeLast: "Davies",
        })).toEqual({ name: "Charlie Davies", kind: "employee", label: "Person" });
        expect(evidenceRequestAssigneeLabel({
            assigneeId: 1,
            userName: "Alex Morgan",
        })).toEqual({ name: "Alex Morgan", kind: "user", label: "User" });
    });

    it("prefers the employee when that column is set, even if a user id is also present", () => {
        expect(evidenceRequestAssigneeLabel({
            assigneeEmployeeId: 4,
            assigneeId: 1,
            employeeFirst: "Charlie",
            employeeLast: "Davies",
            userName: "Alex Morgan",
        })?.label).toBe("Person");
    });

    it("returns null when neither assignee is stored", () => {
        expect(evidenceRequestAssigneeLabel({})).toBeNull();
    });
});
