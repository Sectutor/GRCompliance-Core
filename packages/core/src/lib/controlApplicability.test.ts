import { describe, expect, it } from "vitest";
import { reconcileControlApplicability } from "./controlApplicability";

describe("reconcileControlApplicability", () => {
    it("marks a control excluded when either field becomes not applicable", () => {
        expect(reconcileControlApplicability(
            { status: "not_applicable" },
            { status: "in_progress", applicability: "applicable" }
        )).toEqual({ status: "not_applicable", applicability: "not_applicable" });

        expect(reconcileControlApplicability(
            { applicability: "not_applicable" },
            { status: "implemented", applicability: "applicable" }
        )).toEqual({ status: "not_applicable", applicability: "not_applicable" });
    });

    it("restores an implementation status when a control is included again", () => {
        expect(reconcileControlApplicability(
            { applicability: "applicable" },
            { status: "not_applicable", applicability: "not_applicable" }
        )).toEqual({ status: "not_implemented", applicability: "applicable" });
    });

    it("makes the control applicable when an implementation status is chosen", () => {
        expect(reconcileControlApplicability(
            { status: "implemented" },
            { status: "not_applicable", applicability: "not_applicable" }
        )).toEqual({ status: "implemented", applicability: "applicable" });
    });

    it("does not touch a notes-only update", () => {
        expect(reconcileControlApplicability({}, { status: "in_progress", applicability: "applicable" })).toEqual({});
    });
});
