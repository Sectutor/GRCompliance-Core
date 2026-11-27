import { describe, expect, it } from "vitest";
import { allowedLocalBase, localModelOffer } from "./localModel";

describe("built-in local model", () => {
    it("accepts the compose address and refuses a vendor host", () => {
        expect(allowedLocalBase("http://ollama:11434")?.hostname).toBe("ollama");
        expect(allowedLocalBase("https://grcompliance.com/model")).toBeNull();
        expect(allowedLocalBase("http://user:pass@ollama:11434")).toBeNull();
        const offer = localModelOffer(undefined, 5 * 1024 * 1024 * 1024);
        expect(offer.configured).toBe(false);
        expect(offer.downloadMb).toBe(400);
        expect(offer.note).toMatch(/not sent to us/);
    });
});