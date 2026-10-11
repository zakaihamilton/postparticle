import { saveContent, contentAction } from "../src/lib/content";
import {
  updateProjectRegistry,
  getProject,
  projectStoreFor,
} from "../src/lib/projects";
import { testOrganizationId } from "../tests/e2e/organization";
if (
  process.env.STORAGE_DRIVER !== "local" ||
  !process.env.LOCAL_STORAGE_PATH?.includes("postparticle-test")
)
  throw new Error("Seeding is restricted to explicit local test directories");
await updateProjectRegistry(testOrganizationId, (projects) => {
  const fixtureProjects = [
    {
      id: "demo",
      name: "Demo Journal",
      description: "Stories, ideas, and everything in between.",
      production: false,
      archived: false,
      deleting: false,
    },
    {
      id: "sentry8",
      name: "SENTRY8",
      description: "SENTRY8 content and media.",
      production: true,
      archived: false,
      deleting: false,
    },
  ];
  const existingIds = new Set(projects.map((project) => project.id));
  return [
    ...projects,
    ...fixtureProjects.filter((project) => !existingIds.has(project.id)),
  ];
});
const project = await getProject(testOrganizationId, "demo", {
  includeArchived: true,
});
const store = projectStoreFor(testOrganizationId, project);
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
