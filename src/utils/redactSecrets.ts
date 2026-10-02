/**
 * Redacts values of sensitive environment variables or YAML properties
 * matching SECRET, TOKEN, PASSWORD, KEY, AUTH for safe debug printing.
 */
export function redactYamlSecrets(yamlContent: string): string {
  return yamlContent.replace(
    /((?:SECRET|TOKEN|PASSWORD|KEY|AUTH)[A-Z0-9_]*\s*[:=]\s*)([^\r\n]+)/gi,
    "$1********"
  );
}
