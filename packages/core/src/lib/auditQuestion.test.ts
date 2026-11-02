import { describe, expect, it } from "vitest";
import { ANNEX_A_CONTROLS } from "@/data/annexACatalog";
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

    it("uses Are when the plural noun is not the first word", () => {
        expect(auditReadinessQuestion("Information security roles and responsibilities"))
            .toBe("Are the information security roles and responsibilities implemented and effective?");
        expect(auditReadinessQuestion("Logical Access Controls"))
            .toBe("Are the logical Access Controls implemented and effective?");
        expect(auditReadinessQuestion("Management responsibilities"))
            .toBe("Are the management responsibilities implemented and effective?");
    });

    it("keeps a singular head when the plural noun is only the object", () => {
        expect(auditReadinessQuestion("Segregation of duties"))
            .toBe("Is the segregation of duties implemented and effective?");
        expect(auditReadinessQuestion("Return of assets"))
            .toBe("Is the return of assets implemented and effective?");
        expect(auditReadinessQuestion("Protection of records"))
            .toBe("Is the protection of records implemented and effective?");
    });

    it("agrees with every Annex A control name", () => {
        const pluralName = /\b(roles and responsibilities|responsibilities|policies|procedures|perimeters|facilities|devices|utilities|agreements|rights)\b/i;
        const mismatched = ANNEX_A_CONTROLS
            .filter((control) => pluralName.test(control.name))
            .map((control) => ({ name: control.name, question: auditReadinessQuestion(control.name) }))
            .filter(({ name, question }) => question.startsWith("Is the") && !/\b(of|with|within|against)\b/i.test(name) && !/^\S+ing\b/i.test(name));
        expect(mismatched).toEqual([]);
    });

    it("leaves a question that is already written", () => {
        expect(auditReadinessQuestion("Is logging enabled?"))
            .toBe("Is logging enabled?");
    });
});
