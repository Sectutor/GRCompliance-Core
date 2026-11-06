const UNSAFE = /[\r\n\0"'`$\\]/;

export function assertEnvValue(value) {
    const text = String(value);
    if (!text || UNSAFE.test(text) || text.includes(" ")) {
        throw new Error("Refusing to write an unsafe env value");
    }
    return text;
}

export function upsertEnvKeys(source, entries) {
    let text = String(source || "");
    if (text.length && !text.endsWith("\n")) text += "\n";
    for (const [key, raw] of Object.entries(entries)) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
            throw new Error("Refusing to write an unsafe env key");
        }
        const value = assertEnvValue(raw);
        const line = `${key}=${value}`;
        const pattern = new RegExp(`^${key}=.*$`, "m");
        if (pattern.test(text)) text = text.replace(pattern, line);
        else text += `${line}\n`;
    }
    return text;
}
