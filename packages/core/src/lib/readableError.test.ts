import { describe, expect, it } from "vitest";
import { readableMutationError } from "./readableError";

describe("readableMutationError", () => {
    it("turns the evidenceId zod payload into a field message", () => {
        const raw = JSON.stringify([{
            code: "invalid_type",
            expected: "string",
            received: "undefined",
            path: ["evidenceId"],
            message: "Required",
        }]);
        expect(readableMutationError({ message: raw })).toBe("evidenceId: Required");
    });

    it("reads a structured zod error when the client already parsed one", () => {
        expect(readableMutationError({
            message: "Input validation failed",
            data: { zodError: { fieldErrors: { description: ["Required"] }, formErrors: [] } },
        })).toBe("description: Required");
    });

    it("leaves ordinary messages alone", () => {
        expect(readableMutationError({ message: "Evidence added" })).toBe("Evidence added");
        expect(readableMutationError(undefined)).toBe("Something went wrong");
    });
});
