/**
 * Build an enriched PATH that includes common binary locations.
 */
export function getEnrichedPath(): string;

/**
 * Resolve the absolute path to the `node` binary.
 */
export function resolveNodePath(): string;

/**
 * Pre-resolved node path (computed once at module load time).
 */
export const resolvedNodePath: string;
