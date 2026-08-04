const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]+\b/gi,
  /([?&]token=)[^&\s]+/gi,
] as const;

export function redactSecrets(input: string): string {
  return SECRET_PATTERNS.reduce(
    (value, pattern) => value.replace(pattern, (_match, prefix?: string) => `${prefix ?? ''}[REDACTED]`),
    input,
  );
}
