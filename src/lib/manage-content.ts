import "server-only";
import { z } from "zod";
import { manageProject } from "./manage-api";
import { HttpError, identifier } from "./config";
import {
  contentAction,
  getRecord,
  records,
  restoreRevision,
  saveContent,
} from "./content";
import { events } from "./events";
import { json, readJson } from "./http";
import { publishMedia } from "./media";
import type { Article, Content, Kind } from "./types";

export async function listOrCreateContent(
  request: Request,
  rawProjectId: string,
  kind: Kind,
) {
  const { actor, store } = await manageProject(request, rawProjectId);
  if (request.method === "GET") return json(await records(kind, store));

  const input = await readJson(request);
  const identity = z
    .object({ slug: identifier.optional(), key: identifier.optional() })
    .parse(input);
  const id = kind === "articles" ? identity.slug : identity.key;
  if (id && (await getRecord(kind, id, store)))
    throw new HttpError(
      409,
      "This identifier already exists. Choose a different one.",
    );
  return json({ id: await saveContent(kind, actor.username, input, store) });
}

export async function readOrChangeContent(
  request: Request,
  rawProjectId: string,
  kind: Kind,
  rawId: string,
) {
  const { actor, store } = await manageProject(request, rawProjectId);
  const id = identifier.parse(rawId);
  if (request.method === "GET") {
    const record = await getRecord(kind, id, store);
    if (!record) throw new HttpError(404, "Content not found");
    return json(record);
  }
  if (request.method === "PUT") {
    const input = await readJson(request);
    z.object(
      kind === "articles" ? { slug: z.literal(id) } : { key: z.literal(id) },
    ).parse(input);
    await saveContent(kind, actor.username, input, store);
    return json({ id });
  }

  const data = z
    .object({
      action: z.enum(["publish", "unpublish", "trash", "restore", "revision"]),
      revision: z.string().max(100).optional(),
    })
    .parse(await readJson(request));
  if (data.action === "revision") {
    if (!data.revision) throw new HttpError(400, "Choose a revision");
    await restoreRevision(kind, id, actor.username, data.revision, store);
  } else if (data.action === "publish") {
    const record = await getRecord(kind, id, store);
    if (!record || record.trashed)
      throw new HttpError(404, "Content not found");
    if (kind === "articles" && !(record.draft as Article).body.trim())
      throw new HttpError(400, "Add article content before publishing");
    await publishMedia(record.draft, store, kind);
    // Publish exactly the draft whose referenced media was prepared.
    await contentAction(
      kind,
      id,
      actor.username,
      "publish",
      store,
      record.revision,
    );
  } else {
    await contentAction(kind, id, actor.username, data.action, store);
  }
  return json({ ok: true });
}

export async function readContentHistory(
  request: Request,
  rawProjectId: string,
  kind: Kind,
  rawId: string,
) {
  const { store } = await manageProject(request, rawProjectId);
  const id = identifier.parse(rawId);
  return json(
    (await events<Content>(store, `content/${kind}/${id}`)).filter(
      (event) => event.action === "save",
    ),
  );
}
