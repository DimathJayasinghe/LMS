/**
 * Tenant integrity (ADR 14 §3.2): a child row copies `organizationId` from its parent, so a bug could
 * create a child in a different organization than its parent. Prisma cannot express composite foreign keys
 * on (id, organizationId), so this derives one "mismatch" query per foreign key from schema.prisma and an
 * operator/CI script runs them. Pure functions only; the runner lives in scripts/check-tenant-integrity.ts.
 */

export interface IntegrityCheck {
  name: string;
  sql: string;
}

const MODEL_RE = /^model (\w+) \{\n([\s\S]*?)^\}/gm;
const RELATION_RE =
  /^\s*(\w+)\s+(\w+)\??\s+@relation\((?:"[^"]*",\s*)?fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\]/;

const list = (raw: string): string[] => raw.split(',').map((item) => item.trim());

/** Names of models that carry `organizationId` (every model except Organization itself). */
export const tenantOwnedModels = (schema: string): string[] => {
  const owned: string[] = [];
  for (const match of schema.matchAll(MODEL_RE)) {
    if (match[1] !== 'Organization' && /^\s*organizationId\s/m.test(match[2]!)) owned.push(match[1]!);
  }
  return owned;
};

/** One query per tenant-to-tenant foreign key; each returns the number of rows whose organization differs from their parent's. */
export const buildIntegrityChecks = (schema: string): IntegrityCheck[] => {
  const owned = new Set(tenantOwnedModels(schema));
  const checks: IntegrityCheck[] = [];

  for (const match of schema.matchAll(MODEL_RE)) {
    const child = match[1]!;
    if (!owned.has(child)) continue;

    for (const line of match[2]!.split('\n')) {
      const relation = RELATION_RE.exec(line);
      if (!relation) continue;
      const [, field, parent, rawFields, rawReferences] = relation;
      if (!owned.has(parent!) || parent === child) continue;

      const fields = list(rawFields!);
      const references = list(rawReferences!);
      const join = fields.map((f, i) => `c."${f}" = p."${references[i]}"`).join(' AND ');
      checks.push({
        name: `${child}.${field} -> ${parent}`,
        sql:
          `SELECT count(*)::int AS violations FROM "${child}" c JOIN "${parent}" p ON ${join} ` +
          `WHERE c."organizationId" IS DISTINCT FROM p."organizationId"`,
      });
    }
  }

  return checks;
};
