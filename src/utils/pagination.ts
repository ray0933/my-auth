export interface PageParams {
  page: number;
  limit: number;
}

/** Clamps raw page/limit query params to sane bounds (page >= 1, 1 <= limit <= 100).
 * Extracted from the page/limit parsing previously duplicated inline in admin.controller.ts. */
export function parsePageParams(query: Record<string, unknown>): PageParams {
  const page = Math.max(1, parseInt(query['page'] as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query['limit'] as string) || 20));
  return { page, limit };
}
