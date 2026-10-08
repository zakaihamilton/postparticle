import { saveContent, contentAction } from "../src/lib/content";
import { projectStore } from "../src/lib/storage";
import { testOrganizationId } from "../tests/e2e/organization";
if (
  process.env.STORAGE_DRIVER !== "local" ||
  !process.env.LOCAL_STORAGE_PATH?.includes("postparticle-test")
)
  throw new Error("Seeding is restricted to explicit local test directories");
const store = projectStore(testOrganizationId, "demo");
await saveContent(
  "articles",
  "admin",
  {
    title: "A little room for big ideas",
    slug: "a-little-room",
    excerpt: "An invitation to make something new.",
    body: "## A fresh perspective\n\nEvery great idea needs a little room to grow.\n\nTake a breath. Start a story.",
    author: "Demo Editorial",
    tags: ["ideas", "journal"],
    articleDate: "2026-01-15",
    coverMediaId: "",
    socialMediaId: "",
    seoTitle: "A little room for big ideas",
    seoDescription: "An invitation to make something new.",
  },
  store,
);
await contentAction("articles", "a-little-room", "admin", "publish", store);
console.log("Local content fixture ready.");
