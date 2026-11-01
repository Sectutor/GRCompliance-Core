import { describe, expect, it } from "vitest";
import { auditReadinessQuestion } from "./auditQuestion";

describe("auditReadinessQuestion", () => {
    it("asks a plural question for a plural control name", () => {
        expect(auditReadinessQuestion("Policies for information security"))
            .toBe("Are the policies for information security implemented and effective?");
    });

    it("asks a singular question for a singular control name", () => {
        expect(auditReadinessQuestion("Access control"))
            .toBe("Is the access control implemented and effective?");
    });

    it("uses a neutral sentence when the plural noun is not the first word", () => {
        expect(auditReadinessQuestion("Logical Access Controls"))
            .toBe("Is this control implemented and effective: Logical Access Controls?");
    });

    it("leaves a question that is already written", () => {
        expect(auditReadinessQuestion("Is logging enabled?"))
            .toBe("Is logging enabled?");
    });
});
