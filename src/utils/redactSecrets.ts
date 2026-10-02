/**
 * Redacts values of sensitive environment variables or YAML properties
 * matching SECRET, TOKEN, PASSWORD, PASSWD, CREDENTIAL, and URL passwords for safe debug printing.
 */
export function redactYamlSecrets(yamlContent: string): string {
  // 1. Redact passwords in connection URLs (e.g. postgres://user:password@host:5432/db)
  let redacted = yamlContent.replace(
    /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/:\s]+:)([^@\s]+)(@)/g,
    "$1********$3"
  );

  // 2. Redact sensitive key-value pairs (avoiding overmatches like AUTHOR or KEYBOARD)
  redacted = redacted.replace(
    /((?:^|[ \t])[A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|CREDENTIAL|_KEY|APIKEY)[A-Za-z0-9_]*[ \t]*[:=][ \t]*)(["']?[^\r\n"']+["']?)/gi,
    "$1********"
  );

  return redacted;
}
