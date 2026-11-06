export function redact(value) {
    return String(value ?? "")
        .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1[redacted]@")
        .replace(/\b(PASSWORD|SECRET|TOKEN|PGPASSWORD)=([^\s]+)/gi, "$1=[redacted]")
        .slice(0, 500);
}
