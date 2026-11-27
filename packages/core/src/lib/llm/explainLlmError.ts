type ErrorLike = {
    status?: number;
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string };
};

function textOf(error: unknown): { status: number; code: string; message: string } {
    const err = (error ?? {}) as ErrorLike;
    const cause = err.cause ?? {};
    return {
        status: Number(err.status || 0),
        code: String(err.code || cause.code || ""),
        message: `${err.message || ""} ${cause.message || ""}`.toLowerCase(),
    };
}

/** Plain sentence and a next step. The raw provider message is not included. */
export function explainLlmError(error: unknown): { message: string; next: string } {
    const { status, code, message } = textOf(error);
    if (status === 401 || message.includes("api key") || message.includes("unauthorized") || message.includes("invalid key")) {
        return { message: "The API key was rejected.", next: "Check the key and try the test again." };
    }
    if (status === 402 || message.includes("credit") || message.includes("balance") || message.includes("quota") || message.includes("billing")) {
        return { message: "The provider says this account has no credits left.", next: "Add credits with that provider, or choose another model." };
    }
    if (status === 404 || message.includes("model not found") || message.includes("does not exist")) {
        return { message: "That model was not found.", next: "Check the model name, or pick the smaller built-in model." };
    }
    if (status === 429 || message.includes("rate limit") || message.includes("too many requests")) {
        return { message: "The provider is limiting requests.", next: "Wait a minute and try again." };
    }
    if (code === "ETIMEDOUT" || code === "ABORT_ERR" || message.includes("timeout") || message.includes("timed out") || message.includes("aborted")) {
        return { message: "The model did not answer in time.", next: "Check the address and try again." };
    }
    if (code === "ENOTFOUND" || code === "EAI_AGAIN" || message.includes("getaddrinfo") || message.includes("enotfound")) {
        return { message: "The address could not be found.", next: "Check the base URL. For the built-in model it is the address of this server, not a public site." };
    }
    if (code === "ECONNREFUSED" || message.includes("econnrefused") || message.includes("connection refused")) {
        return { message: "Nothing is listening at that address.", next: "If this is the built-in model, start it on this server and try again." };
    }
    if (message.includes("certificate") || message.includes("unable_to_verify") || message.includes("ssl") || message.includes("tls")) {
        return { message: "The secure connection was rejected.", next: "Check the base URL and the certificate." };
    }
    if (message.includes("out of memory") || message.includes("oom") || message.includes("requires more system memory")) {
        return { message: "This model needs more memory than this server has.", next: "Choose a smaller model." };
    }
    if (message.includes("invalid url") || message.includes("wrong base")) {
        return { message: "The base URL does not look like an address.", next: "Use a full http or https address, including the port." };
    }
    return { message: "We could not reach the model.", next: "Check the key, the model name, and the base URL, then try again." };
}

export function explainLlmErrorText(error: unknown): string {
    const explained = explainLlmError(error);
    return `${explained.message} ${explained.next}`;
}
