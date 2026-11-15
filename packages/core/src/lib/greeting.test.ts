import { describe, expect, it } from "vitest";
import { accountGreetingName, accountPrimaryLabel, greetingPeriod } from "./greeting";

describe("greetingPeriod", () => {
    it("uses the given time zone rather than the runtime clock", () => {
        const instant = new Date("2026-01-15T12:00:00Z");
        expect(greetingPeriod(instant, "UTC")).toBe("Afternoon");
        expect(greetingPeriod(instant, "America/New_York")).toBe("Morning");
        expect(greetingPeriod(instant, "Asia/Tokyo")).toBe("Evening");
    });
});

describe("account labels", () => {
    it("shows the stored name, and the email when no name was set", () => {
        expect(accountPrimaryLabel("Priya Shah", "priya@example.com")).toBe("Priya Shah");
        expect(accountGreetingName("Priya Shah", "priya@example.com")).toBe("Priya");
        expect(accountPrimaryLabel(null, "admin@grcompliance.local")).toBe("admin@grcompliance.local");
        expect(accountGreetingName(null, "admin@grcompliance.local")).toBe("admin");
        expect(accountGreetingName("  ", "admin@grcompliance.local")).toBe("admin");
    });
});
