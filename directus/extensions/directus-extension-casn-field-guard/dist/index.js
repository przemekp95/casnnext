const MANAGED_COLLECTIONS = new Set(["Author", "Analysis", "IssueCollection"]);
const TECHNICAL_FIELDS = ["strapiId", "sourceHash"];

class TechnicalFieldForbiddenError extends Error {
  name = "DirectusError";
  code = "FORBIDDEN";
  status = 403;

  constructor(collection, fields) {
    const fieldList = fields.join(", ");
    super(`Technical field changes are forbidden for ${collection}: ${fieldList}`);
    this.extensions = {
      reason: this.message,
      collection,
      fields,
    };
  }
}

export function guardTechnicalFields(payload, { collection }) {
  if (!MANAGED_COLLECTIONS.has(collection)) return payload;

  const records = Array.isArray(payload) ? payload : [payload];
  const attemptedFields = [
    ...new Set(
      records.flatMap((record) =>
        TECHNICAL_FIELDS.filter(
          (field) => record && typeof record === "object" && Object.hasOwn(record, field),
        ),
      ),
    ),
  ];

  if (attemptedFields.length > 0) {
    throw new TechnicalFieldForbiddenError(collection, attemptedFields);
  }

  return payload;
}

function registerFieldGuard({ filter }) {
  filter("items.create", guardTechnicalFields);
  filter("items.update", guardTechnicalFields);
}

export default registerFieldGuard;
