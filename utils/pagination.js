/**
 * Parse standard pagination/sort/search query params.
 *
 * Accepts: ?page=1&limit=20&sort=-createdAt&q=foo
 * Returns: { page, limit, skip, sort, q }
 *
 * - limit clamped to [1, 100]
 * - sort accepts comma-separated fields with optional '-' prefix for desc
 *   "-createdAt,name" -> { createdAt: -1, name: 1 }
 */
const parsePagination = (query = {}, defaults = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || defaults.page || 1);
  const rawLimit = parseInt(query.limit, 10) || defaults.limit || 20;
  const limit = Math.min(100, Math.max(1, rawLimit));
  const skip = (page - 1) * limit;

  const sortStr = (query.sort || defaults.sort || '-createdAt').toString();
  const sort = sortStr.split(',').reduce((acc, field) => {
    const trimmed = field.trim();
    if (!trimmed) return acc;
    if (trimmed.startsWith('-')) acc[trimmed.slice(1)] = -1;
    else acc[trimmed] = 1;
    return acc;
  }, {});

  const q = query.q ? String(query.q).trim() : '';

  return { page, limit, skip, sort, q };
};

const buildPaginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  pages: Math.max(1, Math.ceil(total / limit)),
});

export { parsePagination, buildPaginationMeta };
