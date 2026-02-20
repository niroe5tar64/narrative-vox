export type CliOptions = Record<string, string | boolean>;

/**
 * Parse CLI-style `--key value` pairs into a flat object.
 */
export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = value;
    i += 1;
  }
  return options;
}

export function optionAsString(options: CliOptions, key: string): string | undefined {
  const value = options[key];
  if (!value || value === true) {
    return undefined;
  }
  return String(value);
}

export function ensureOption(options: CliOptions, key: string, command: string): string {
  const value = options[key];
  if (!value || value === true) {
    throw new Error(`Missing required option --${key} for ${command}. See --help.`);
  }
  return String(value);
}

export function optionAsNumber(options: CliOptions, key: string): number | undefined {
  const value = optionAsString(options, key);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Option --${key} must be a valid number.`);
  }
  return parsed;
}
