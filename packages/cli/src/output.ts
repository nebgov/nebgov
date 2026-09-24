export type GlobalOptions = {
  human?: boolean;
  dryRun?: boolean;
  config?: string;
};

export function output(value: unknown, opts: GlobalOptions): void {
  if (opts.human) {
    if (Array.isArray(value)) {
      console.table(value);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        console.log(`${key}: ${typeof val === "bigint" ? val.toString() : String(val)}`);
      }
      return;
    }
    console.log(String(value));
    return;
  }

  console.log(
    JSON.stringify(
      value,
      (_key, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
}

/** Render `KEY=value` lines that can be pasted straight into a `.env` file. */
export function formatEnv(vars: Record<string, string>, comment?: string): string {
  const lines = Object.entries(vars).map(([key, value]) => `${key}=${value}`);
  return (comment ? [`# ${comment}`, ...lines] : lines).join("\n");
}
