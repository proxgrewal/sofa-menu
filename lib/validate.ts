// ---------------------------------------------------------------------------
// Tiny request-validation helpers.
//
// SOFA routes previously cast raw JSON straight to their domain input types
// (`body as PlaceOrderInput`), trusting the network. These helpers give each
// API a real parse boundary without adding a schema dependency — they throw a
// ValidationError (mapped to HTTP 400 by callers) on any malformed field.
// ---------------------------------------------------------------------------

export class ValidationError extends Error {
  status = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function str(
  v: unknown,
  field: string,
  opts: { max?: number; optional?: boolean } = {}
): string {
  if (v === undefined || v === null) {
    if (opts.optional) return "";
    throw new ValidationError(`"${field}" is required.`);
  }
  if (typeof v !== "string") throw new ValidationError(`"${field}" must be a string.`);
  if (opts.max !== undefined && v.length > opts.max) {
    throw new ValidationError(`"${field}" must be at most ${opts.max} characters.`);
  }
  return v;
}

export function int(v: unknown, field: string, opts: { min?: number; max?: number } = {}): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n)) throw new ValidationError(`"${field}" must be an integer.`);
  if (opts.min !== undefined && n < opts.min)
    throw new ValidationError(`"${field}" must be >= ${opts.min}.`);
  if (opts.max !== undefined && n > opts.max)
    throw new ValidationError(`"${field}" must be <= ${opts.max}.`);
  return n;
}

/** Validate a guest order-placement payload. */
export function parseOrderInput(body: unknown): {
  restaurantSlug: string;
  tableLabel?: string;
  items: { dishId: string; quantity: number }[];
  note?: string;
} {
  if (!isObject(body)) throw new ValidationError("Request body must be a JSON object.");
  const restaurantSlug = str(body.restaurantSlug, "restaurantSlug", { max: 100 });

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError('"items" must be a non-empty array.');
  }
  if (body.items.length > 100) throw new ValidationError('"items" has too many lines.');

  const items = body.items.map((raw, i) => {
    if (!isObject(raw)) throw new ValidationError(`"items[${i}]" must be an object.`);
    return {
      dishId: str(raw.dishId, `items[${i}].dishId`, { max: 100 }),
      quantity: int(raw.quantity, `items[${i}].quantity`, { min: 1, max: 99 }),
    };
  });

  return {
    restaurantSlug,
    tableLabel: str(body.tableLabel, "tableLabel", { max: 60, optional: true }) || undefined,
    items,
    note: str(body.note, "note", { max: 500, optional: true }) || undefined,
  };
}
