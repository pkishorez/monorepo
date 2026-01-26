import { ulid } from "ulid";

/**
 * Generates a new ULID (Universally Unique Lexicographically Sortable Identifier).
 * ULIDs are time-ordered and suitable for DynamoDB sort keys.
 *
 * @returns A new ULID string
 */
export const generateUlid = (): string => ulid();
