const productId = "postparticle";
const read = `${productId}:project:read`;
const write = `${productId}:project:write`;
const manageMembers = `${productId}:members:manage`;

export async function GET() {
  return Response.json(
    {
      schemaVersion: 1,
      productId,
      version: "1.0.0",
      roles: [
        {
          id: "project-viewer",
          name: "Project viewer",
          description: "View project content.",
          role: "viewer",
          scopeKinds: ["project"],
          actions: [read],
        },
        {
          id: "project-editor",
          name: "Project editor",
          description: "Create and edit project content.",
          role: "editor",
          scopeKinds: ["project"],
          actions: [read, write],
        },
        {
          id: "project-admin",
          name: "Project administrator",
          description: "Manage project content and member access.",
          role: "admin",
          scopeKinds: ["project"],
          actions: [read, write, manageMembers],
        },
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
