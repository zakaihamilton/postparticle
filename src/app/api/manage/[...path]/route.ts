import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  allowedProjects,
  authorize,
  getUser,
  hashPassword,
  listUsers,
  membership,
  requireActor,
  revokeUserSessions,
  saveUser,
  setMembership,
} from "@/lib/auth";
import { HttpError, identifier, localDriver, projectById } from "@/lib/config";
import {
  contentAction,
  getRecord,
  records,
  restoreRevision,
  saveContent,
} from "@/lib/content";
import { events } from "@/lib/events";
import {
  errorResponse,
  json,
  readBytes,
  readJson,
  sameOrigin,
} from "@/lib/http";
import {
  abortUpload,
  deleteMedia,
  editMedia,
  finishUpload,
  getMedia,
  listMedia,
  previewMedia,
  publishMedia,
  signPart,
  startUpload,
  writeLocalUpload,
} from "@/lib/media";
import { projectStore } from "@/lib/storage";
import type { Article, Content, Kind } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  try {
    const write = request.method !== "GET";
    if (write) sameOrigin(request);
    const actor = await requireActor();
    const { path } = await context.params;
    if (path[0] === "projects" && path.length === 1 && !write)
      return json({ actor, projects: await allowedProjects(actor) });
    if (path[0] === "users") {
      if (!actor.platformAdmin)
        throw new HttpError(403, "Platform administrator access required");
      if (!write)
        return json(
          (await listUsers()).map(({ username, platformAdmin, disabled }) => ({
            username,
            platformAdmin,
            disabled,
          })),
        );
      if (path.length === 1 && request.method === "POST") {
        const data = z
          .object({
            username: identifier,
            password: z.string().min(12).max(256),
          })
          .parse(await readJson(request));
        if (await getUser(data.username))
          throw new HttpError(409, "Account already exists");
        await saveUser(actor.username, {
          username: data.username,
          passwordHash: await hashPassword(data.password),
          platformAdmin: false,
          disabled: false,
          sessionVersion: randomUUID(),
        });
        return json({ ok: true }, 201);
      }
      const user = await getUser(identifier.parse(path[1]));
      if (!user) throw new HttpError(404, "Account not found");
      if (path[2] === "revoke") {
        await revokeUserSessions(actor.username, user.username);
        return json({ ok: true });
      }
      if (request.method === "PATCH") {
        if (user.username === actor.username)
          throw new HttpError(
            400,
            "Use account settings to change your own account",
          );
        const data = z
          .object({
            disabled: z.boolean().optional(),
            password: z.string().min(12).max(256).optional(),
          })
          .parse(await readJson(request));
        await saveUser(actor.username, {
          ...user,
          disabled: data.disabled ?? user.disabled,
          passwordHash: data.password
            ? await hashPassword(data.password)
            : user.passwordHash,
          sessionVersion: randomUUID(),
        });
        return json({ ok: true });
      }
    }
    if (path[0] !== "projects" || !path[1])
      throw new HttpError(404, "Route not found");
    const projectId = identifier.parse(path[1]);
    const role = await authorize(
      actor,
      projectId,
      write,
      path[2] === "members",
    );
    const store = projectStore(projectId);
    if (path.length === 2 && !write) {
      const project = projectById(projectId);
      return json({ project, role });
    }
    if (path[2] === "members") {
      if (!write)
        return json(
          await Promise.all(
            (await listUsers()).map(async ({ username, disabled }) => ({
              username,
              disabled,
              role: await membership(username, projectId),
            })),
          ),
        );
      const data = z
        .object({
          username: identifier,
          role: z.enum(["admin", "editor", "viewer"]).nullable(),
        })
        .parse(await readJson(request));
      if (!(await getUser(data.username)))
        throw new HttpError(
          404,
          "Create this account as a platform administrator first",
        );
      if (!actor.platformAdmin && data.username === actor.username)
        throw new HttpError(
          400,
          "Ask another administrator to change your role",
        );
      await setMembership(actor.username, data.username, projectId, data.role);
      return json({ ok: true });
    }
    if (["articles", "documents"].includes(path[2])) {
      const kind = path[2] as Kind;
      const id = path[3];
      if (!write) {
        if (!id) return json(await records(kind, store));
        if (path[4] === "history")
          return json(
            (
              await events<Content>(
                store,
                `content/${kind}/${identifier.parse(id)}`,
              )
            ).filter((e) => e.action === "save"),
          );
        const record = await getRecord(kind, id, store);
        if (!record) throw new HttpError(404, "Content not found");
        return json(record);
      }
      if (!id && request.method === "POST") {
        const input = await readJson(request);
        const identity = z
          .object({ slug: identifier.optional(), key: identifier.optional() })
          .parse(input);
        const newId = kind === "articles" ? identity.slug : identity.key;
        if (newId && (await getRecord(kind, newId, store)))
          throw new HttpError(
            409,
            "This identifier already exists. Choose a different one.",
          );
        return json({
          id: await saveContent(kind, actor.username, input, store),
        });
      }
      if (id && request.method === "PUT") {
        const input = await readJson(request);
        const identity = z
          .object(
            kind === "articles"
              ? { slug: z.literal(id) }
              : { key: z.literal(id) },
          )
          .parse(input);
        void identity;
        await saveContent(kind, actor.username, input, store);
        return json({ id });
      }
      if (id && request.method === "POST") {
        const data = z
          .object({
            action: z.enum([
              "publish",
              "unpublish",
              "trash",
              "restore",
              "revision",
            ]),
            revision: z.string().max(100).optional(),
          })
          .parse(await readJson(request));
        if (data.action === "revision") {
          if (!data.revision) throw new HttpError(400, "Choose a revision");
          await restoreRevision(kind, id, actor.username, data.revision, store);
        } else {
          if (data.action === "publish") {
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
          } else
            await contentAction(kind, id, actor.username, data.action, store);
        }
        return json({ ok: true });
      }
    }
    if (path[2] === "media") {
      const id = path[3];
      if (!write) {
        if (!id) return json(await listMedia(store));
        if (path[4] === "preview-file")
          return new Response(null, {
            status: 302,
            headers: {
              Location: await previewMedia(id, store),
              "Cache-Control": "no-store",
            },
          });
        if (path[4] === "preview")
          return json({ url: await previewMedia(id, store) });
        const media = await getMedia(id, store);
        if (!media || media.deleted)
          throw new HttpError(404, "Media not found");
        return json(media);
      }
      if (!id)
        return json(
          await startUpload(
            actor.username,
            await readJson(request),
            store,
            projectId,
          ),
        );
      if (path[4] === "bytes" && request.method === "PUT") {
        if (!localDriver()) throw new HttpError(404, "Not found");
        if (Number(request.headers.get("content-length")) > 32 * 1024 * 1024)
          throw new HttpError(413, "Local test uploads are limited to 32 MiB");
        await writeLocalUpload(
          id,
          await readBytes(request, 32 * 1024 * 1024),
          store,
        );
        return json({ ok: true });
      }
      if (path[4] === "part") {
        const data = z
          .object({ part: z.number().int() })
          .parse(await readJson(request));
        return json({ url: await signPart(id, data.part, store) });
      }
      if (path[4] === "complete") {
        const data = z
          .object({ parts: z.unknown().optional() })
          .parse(await readJson(request));
        await finishUpload(actor.username, id, data.parts, store);
        return json({ ok: true });
      }
      if (path[4] === "abort") {
        await abortUpload(id, store);
        return json({ ok: true });
      }
      if (request.method === "PATCH") {
        await editMedia(actor.username, id, await readJson(request), store);
        return json({ ok: true });
      }
      if (request.method === "DELETE") {
        await deleteMedia(actor.username, id, store);
        return json({ ok: true });
      }
    }
    throw new HttpError(404, "Route not found");
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
