export type BlogSearchParams = Record<string, string | string[] | undefined>;
export function readBlogFilters(params: BlogSearchParams) {
  const errors: string[] = [];
  function single(key: string) {
    const value = params[key];
    if (Array.isArray(value)) {
      errors.push(`Use only one ${key} parameter.`);
      return value[0] || "";
    }
    return value || "";
  }
  const q = single("q");
  const tag = single("tag");
  const order = single("order");
  const page = single("page");
  if (q.length > 200) errors.push("Search must be 200 characters or fewer.");
  if (tag.length > 60) errors.push("Tag must be 60 characters or fewer.");
  if (order && order !== "asc" && order !== "desc")
    errors.push("Choose ascending or descending date order.");
  const pageNumber = page ? Number(page) : 1;
  if (
    !Number.isSafeInteger(pageNumber) ||
    pageNumber < 1 ||
    pageNumber > 100000
  )
    errors.push(
      "Page must be a whole number from 1 to 100000. Apply filters to return to page 1.",
    );
  return {
    q,
    tag,
    dateOrder: order === "asc" ? ("asc" as const) : ("desc" as const),
    pageNumber,
    errors,
  };
}
