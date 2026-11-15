import { notFound } from "next/navigation";
import Preview from "./preview";

export default function PreviewPage() {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.VERCEL_ENV !== "preview"
  ) {
    notFound();
  }
  return <Preview />;
}
