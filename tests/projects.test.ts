import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  beginProjectDeletion,
  getProjectRegistry,
  getProject,
  projectStoreFor,
  updateProjectRegistry,
  writeProjectRegistry,
  type ProjectRecord,
} from "@/lib/projects";
import { LocalStore } from "@/lib/storage";

const organizationA = "550e8400-e29b-41d4-a716-446655440000";
const organizationB = "550e8400-e29b-41d4-a716-446655440001";
let root: string;
let store: LocalStore;

function project(id: string, name = id, description = ""): ProjectRecord {
  return {
    id,
    name,
    description,
    production: true,
    archived: false,
    deleting: false,
  };
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "postparticle-projects-"));
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("LOCAL_STORAGE_PATH", root);
  store = new LocalStore("__content", root);
});

beforeEach(async () => {
  await rm(path.join(root, "__content"), { recursive: true, force: true });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("project registry projections", () => {
  it("preserves concurrent updates to different projects", async () => {
    await writeProjectRegistry(
      organizationA,
      [project("alpha", "Alpha"), project("beta", "Beta")],
      { onlyIfMissing: true },
    );

    await Promise.all([
      updateProjectRegistry(organizationA, (projects) =>
        projects.map((item) =>
          item.id === "alpha" ? { ...item, name: "Alpha edited" } : item,
        ),
      ),
      updateProjectRegistry(organizationA, (projects) =>
        projects.map((item) =>
          item.id === "beta"
            ? { ...item, description: "Beta description" }
            : item,
        ),
      ),
    ]);

    expect(
      await getProjectRegistry(organizationA, { includeArchived: true }),
    ).toMatchObject([
      { id: "alpha", name: "Alpha edited" },
      { id: "beta", description: "Beta description" },
    ]);
  });

  it("resumes a partial immutable registry initialization", async () => {
    const alpha = project("alpha", "Alpha");
    const beta = project("beta", "Beta");
    await writeProjectRegistry(organizationA, [alpha], { onlyIfMissing: true });

    await writeProjectRegistry(organizationA, [alpha, beta], {
      onlyIfMissing: true,
    });

    expect(
      await getProjectRegistry(organizationA, { includeArchived: true }),
    ).toEqual([alpha, beta]);
  });

  it("keeps the registry usable and marks same-project branches for resolution", async () => {
    const base = project("alpha", "Alpha");
    const beta = project("beta", "Beta");
    await writeProjectRegistry(organizationA, [base, beta], {
      onlyIfMissing: true,
    });
    const previousHash = createHash("sha256")
      .update(JSON.stringify(base))
      .digest("hex");
    const branches = [
      { ...base, name: "Alpha left" },
      { ...base, name: "Alpha right" },
    ];
    for (const next of branches) {
      const nextHash = createHash("sha256")
        .update(JSON.stringify(next))
        .digest("hex");
      const edge = createHash("sha256")
        .update(`${previousHash}\0${nextHash}`)
        .digest("hex");
      await store.put(
        `organizations/${organizationA}/project-registry/changes/alpha/${edge}.json`,
        {
          version: 1,
          organizationId: organizationA,
          projectId: "alpha",
          previousHash,
          nextHash,
          next,
        },
      );
    }

    const conflicted = await getProjectRegistry(organizationA);
    expect(conflicted).toHaveLength(2);
    expect(conflicted.find((item) => item.id === "alpha")).toMatchObject({
      registryConflict: true,
    });
    await expect(getProject(organizationA, "beta")).resolves.toMatchObject({
      id: "beta",
    });

    const selected = await getProject(organizationA, "alpha");
    await updateProjectRegistry(organizationA, (projects) => projects, {
      resolveProjectIds: ["alpha"],
    });
    expect(
      (await getProjectRegistry(organizationA)).some(
        (item) => item.registryConflict,
      ),
    ).toBe(false);
    expect(await getProject(organizationA, "alpha")).toMatchObject({
      name: selected.name,
    });

    await updateProjectRegistry(organizationA, (projects) =>
      projects.map((item) =>
        item.id === "alpha" ? { ...item, name: "Alpha resolved" } : item,
      ),
    );
    expect(await getProjectRegistry(organizationA)).toMatchObject([
      { id: "alpha", name: "Alpha resolved" },
      { id: "beta", name: "Beta" },
    ]);
    expect(
      (await getProjectRegistry(organizationA)).some(
        (item) => item.registryConflict,
      ),
    ).toBe(false);
  });

  it("keeps identical project IDs inside their organization storage scopes", async () => {
    const a = projectStoreFor(organizationA, project("shared"));
    const b = projectStoreFor(organizationB, project("shared"));
    await a.put("content/articles/story/event.json", { owner: "a" });
    await b.put("content/articles/story/event.json", { owner: "b" });

    expect(await a.get("content/articles/story/event.json")).toEqual({
      owner: "a",
    });
    expect(await b.get("content/articles/story/event.json")).toEqual({
      owner: "b",
    });
    expect(
      await new LocalStore(`${organizationA}/shared`, root).get(
        "content/articles/story/event.json",
      ),
    ).toEqual({ owner: "a" });
  });

  it("can remove a project after its deletion marker is written", async () => {
    await writeProjectRegistry(
      organizationA,
      [project("retire-me", "Retire me")],
      { onlyIfMissing: true },
    );
    await beginProjectDeletion(organizationA, "retire-me");

    await updateProjectRegistry(organizationA, (projects) =>
      projects.filter((item) => item.id !== "retire-me"),
    );

    expect(
      await getProjectRegistry(organizationA, {
        includeArchived: true,
        includeDeleting: true,
      }),
    ).toEqual([]);
  });
});
