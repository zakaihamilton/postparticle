import { z } from "zod";

export function mediaReferenceId(value: string): string | null {
  if (!/^media:/i.test(value)) return null;
  const parsed = z.string().uuid().safeParse(value.slice(6));
  return parsed.success ? parsed.data.toLowerCase() : null;
}

// Consume the whole candidate so an invalid suffix is never partially rewritten.
export function replaceMediaReferences(
  text: string,
  resolve: (id: string) => string,
): string {
  return text.replace(/\bmedia:[a-z0-9_-]+/gi, (reference) => {
    const id = mediaReferenceId(reference);
    return id ? resolve(id) : reference;
  });
}
