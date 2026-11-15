export type GreetingPeriod = "Morning" | "Afternoon" | "Evening";

/** Hour in the given IANA time zone. Falls back to the runtime zone when the name is unusable. */
export function hourInTimeZone(date: Date, timeZone: string): number {
    try {
        const hour = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            hourCycle: "h23",
            timeZone,
        }).format(date);
        const parsed = Number(hour);
        if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 23) return parsed;
    } catch {
        // An unknown zone name throws. Use the runtime clock below.
    }
    return date.getHours();
}

export function greetingPeriod(date: Date, timeZone: string): GreetingPeriod {
    const hour = hourInTimeZone(date, timeZone);
    if (hour < 12) return "Morning";
    if (hour < 18) return "Afternoon";
    return "Evening";
}

export function browserTimeZone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
}

export function accountGreetingName(name: string | null | undefined, email: string | null | undefined): string {
    const trimmed = name?.trim();
    if (trimmed) return trimmed.split(/\s+/)[0];
    const local = email?.trim().split("@")[0];
    return local || "there";
}

export function accountPrimaryLabel(name: string | null | undefined, email: string | null | undefined): string {
    const trimmed = name?.trim();
    if (trimmed) return trimmed;
    return email?.trim() || "Signed in";
}
