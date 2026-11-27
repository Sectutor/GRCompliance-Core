import { describe, expect, it } from "vitest";
import { explainLlmErrorText } from "./explainLlmError";

describe("plain LLM errors", () => {
    it("explains a rejected key, a timeout, a refused connection, and a model that is too big", () => {
        expect(explainLlmErrorText({ status: 401, message: "Incorrect API key sk-secret" })).toBe(
            "The API key was rejected. Check the key and try the test again.",
        );
        expect(explainLlmErrorText({ status: 401, message: "Incorrect API key sk-secret" })).not.toContain("sk-secret");
        expect(explainLlmErrorText({ code: "ETIMEDOUT", message: "connect ETIMEDOUT 10.0.0.8:443" })).toMatch(/did not answer in time/);
        expect(explainLlmErrorText({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:11434" })).toMatch(/Nothing is listening/);
        expect(explainLlmErrorText({ message: "model requires more system memory" })).toMatch(/smaller model/);
    });
});
