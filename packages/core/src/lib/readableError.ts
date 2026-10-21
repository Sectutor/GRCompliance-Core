type ReadableError = {
    message?: string;
    data?: {
        zodError?: {
            formErrors?: string[];
            fieldErrors?: Record<string, string[] | undefined>;
        };
    };
};

function fromZodIssues(raw: string): string | null {
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        const parts = parsed
            .map((issue) => {
                if (!issue || typeof issue !== "object") return null;
                const path = Array.isArray(issue.path) ? issue.path.filter(Boolean).join(".") : "";
                const message = typeof issue.message === "string" ? issue.message : "Invalid value";
                return path ? `${path}: ${message}` : message;
            })
            .filter((part): part is string => !!part);
        return parts.length > 0 ? parts.join("; ") : null;
    } catch {
        return null;
    }
}

/** Turn a tRPC/zod failure into a sentence a toast can show. */
export function readableMutationError(error: ReadableError | null | undefined): string {
    const zod = error?.data?.zodError;
    if (zod) {
        const form = zod.formErrors ?? [];
        const fields = Object.entries(zod.fieldErrors ?? {}).flatMap(([key, messages]) =>
            (messages ?? []).map((message) => (key ? `${key}: ${message}` : message))
        );
        const parts = [...form, ...fields].filter(Boolean);
        if (parts.length > 0) return parts.join("; ");
    }

    const raw = error?.message?.trim();
    if (!raw) return "Something went wrong";
    return fromZodIssues(raw) ?? raw;
}
