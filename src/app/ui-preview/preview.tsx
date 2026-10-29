"use client";

import { useMemo, useState } from "react";
import Workspace from "@/components/workspace";
import ProjectPicker from "@/components/project-picker";
import { AccountArea } from "@/components/account-area";
import { YourAccountSettings } from "@/components/settings/your-account-settings";
import { PlatformAccountsSettings } from "@/components/settings/platform-accounts-settings";
import { CreatePlatformAccountSettings } from "@/components/settings/create-platform-account-settings";
import { ResetPlatformAccountPassword } from "@/components/settings/reset-platform-account-password";
import { ProjectSettings } from "@/components/settings/project-settings";
import { ProjectCreationForm } from "@/components/settings/project-creation-form";
import type {
  Article,
  RecordState,
  WorkspaceDashboardResult,
  Role,
} from "@/lib/types";
import { PreviewDropdown, PreviewToolbar } from "@zakaihamilton/ui-preview-kit";

const actor = {
  username: "Alex Morgan",
  organizationId: "preview",
  organizationName: "Example Studio",
  organizations: [
    {
      organizationId: "preview",
      organizationName: "Example Studio",
      platformAdmin: false,
    },
  ],
  platformAdmin: false,
};
const adminActor = { ...actor, platformAdmin: true };
const syntheticImageUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='300'%3E%3Crect width='480' height='300' fill='%23e9eee9'/%3E%3Ctext x='50' y='150' font-size='30'%3EStudio notes%3C/text%3E%3C/svg%3E";
const project = {
  id: "preview",
  name: "The Field Notes",
  description: "Synthetic preview project",
};
const articles = [
  {
    id: "1",
    draft: {
      title: "A quieter way to work",
      author: "Alex Morgan",
      tags: ["Culture", "Ideas"],
      articleDate: "2026-10-23",
    },
    published: true,
    trashed: false,
    updatedAt: "2026-10-23T09:00:00Z",
  },
  {
    id: "2",
    draft: {
      title: "Notes from the studio",
      author: "Sam Lee",
      tags: ["Journal"],
      articleDate: "2026-10-20",
    },
    published: false,
    trashed: false,
    updatedAt: "2026-10-20T09:00:00Z",
  },
  {
    id: "3",
    draft: {
      title: "Designing for the long view",
      author: "Alex Morgan",
      tags: ["Design", "Research", "Process"],
      articleDate: "2026-10-14",
    },
    published: true,
    trashed: false,
    updatedAt: "2026-10-14T09:00:00Z",
  },
];
const existingArticle: Article = {
  title: "A quieter way to work",
  slug: "a-quieter-way-to-work",
  excerpt: "Small habits make space for thoughtful work.",
  body: "# Make room for focus\n\nA little quiet can make a big difference.",
  author: "Alex Morgan",
  tags: ["culture", "ideas"],
  articleDate: "2026-10-23",
  coverMediaId: "",
  seoTitle: "A quieter way to work",
  seoDescription: "Practical notes on focus.",
  socialMediaId: "",
};
const existingRecord: RecordState<Article> = {
  id: "preview-article",
  draft: existingArticle,
  published: existingArticle,
  createdAt: "2026-10-20T09:00:00Z",
  updatedAt: "2026-10-23T09:00:00Z",
  publishedAt: "2026-10-23T09:00:00Z",
  trashed: false,
  revision: "preview-revision",
};
type Screen =
  | "overview"
  | "articles"
  | "documents"
  | "editor"
  | "existing-article"
  | "document-editor"
  | "new-document"
  | "media-details"
  | "members"
  | "project-admin"
  | "project-create"
  | "platform-accounts"
  | "platform-account-create"
  | "platform-account-reset"
  | "project-picker"
  | "account"
  | "media"
  | "settings";
type Scenario = "populated" | "empty" | "error";
type ArticleScenario = "draft" | "published" | "history";
function fixture(scenario: Scenario): WorkspaceDashboardResult {
  if (scenario === "error")
    return {
      data: null,
      error: "Workspace summary is temporarily unavailable.",
    };
  if (scenario === "empty")
    return {
      data: {
        articleCount: 0,
        publishedCount: 0,
        mediaCount: 0,
        recentArticles: [],
      },
      error: "",
    };
  return {
    data: {
      articleCount: 12,
      publishedCount: 8,
      mediaCount: 24,
      recentArticles: articles,
    },
    error: "",
  };
}
export default function Preview() {
  const [previewRole, setPreviewRole] = useState<Role>("admin");
  const [screen, setScreen] = useState<Screen>("overview");
  const [articleScenario, setArticleScenario] =
    useState<ArticleScenario>("published");
  const [scenario, setScenario] = useState<Scenario>("populated");
  const dashboard = useMemo(
    () => Promise.resolve(fixture(scenario)),
    [scenario],
  );
  const previewRequest = useMemo(
    () =>
      async <T,>(url: string, options?: RequestInit): Promise<T> => {
        if (options?.method && options.method !== "GET")
          throw new Error("Changes are disabled in UI preview.");
        if (screen !== "existing-article" && scenario === "error")
          throw new Error("Preview data is temporarily unavailable.");
        if (url === "/api/manage/users")
          return (
            scenario === "empty"
              ? []
              : [
                  {
                    username: actor.username,
                    platformAdmin: true,
                    disabled: false,
                  },
                  {
                    username: "sam@example.test",
                    platformAdmin: false,
                    disabled: false,
                  },
                  {
                    username: "former@example.test",
                    platformAdmin: false,
                    disabled: true,
                  },
                ]
          ) as T;
        if (url.startsWith("/api/manage/users/") && url.endsWith("/projects"))
          return {
            projects:
              scenario === "empty"
                ? []
                : [
                    { ...project, role: "editor" },
                    {
                      id: "archive",
                      name: "Archive",
                      description: "Older stories",
                      role: null,
                    },
                  ],
          } as T;
        if (url === "/api/manage/projects/catalog")
          return {
            projects:
              scenario === "empty"
                ? []
                : [
                    {
                      ...project,
                      production: true,
                      archived: false,
                      deleting: false,
                    },
                    {
                      id: "archive",
                      name: "Archive",
                      description: "Older stories",
                      production: false,
                      archived: true,
                      deleting: false,
                    },
                  ],
          } as T;
        if (url.includes("/editor?")) {
          const id = new URL(url, "http://preview.local").searchParams.get(
            "id",
          );
          return {
            record:
              id === "preview-document"
                ? {
                    ...existingRecord,
                    id: "preview-document",
                    draft: {
                      title: "Homepage configuration",
                      key: "homepage",
                      tags: ["site"],
                      value: { headline: "Welcome", featured: true },
                    },
                    published: null,
                    publishedAt: null,
                  }
                : id === "preview-article"
                  ? {
                      ...existingRecord,
                      published:
                        articleScenario === "draft" ? null : existingArticle,
                      publishedAt:
                        articleScenario === "draft"
                          ? null
                          : existingRecord.publishedAt,
                      draft:
                        articleScenario === "history"
                          ? {
                              ...existingArticle,
                              body: `${existingArticle.body}\n\nA saved draft with newer ideas.`,
                            }
                          : existingArticle,
                    }
                  : null,
            media: [],
          } as T;
        }
        if (url.endsWith("/history"))
          return (
            articleScenario === "history"
              ? [
                  {
                    id: "revision-1",
                    at: "2026-10-20T09:00:00Z",
                    actor: "Alex Morgan",
                    title: "First draft",
                  },
                  {
                    id: "revision-2",
                    at: "2026-10-22T10:00:00Z",
                    actor: "Sam Lee",
                    title: "Editorial review",
                  },
                  {
                    id: "revision-3",
                    at: "2026-10-23T09:00:00Z",
                    actor: "Alex Morgan",
                    title: "Published version",
                  },
                ]
              : []
          ) as T;
        if (url.includes("/members"))
          return (
            scenario === "empty"
              ? []
              : [
                  {
                    username: "alex@example.test",
                    disabled: false,
                    accessActive: true,
                    role: "admin",
                  },
                  {
                    username: "sam@example.test",
                    disabled: false,
                    accessActive: true,
                    role: "editor",
                  },
                ]
          ) as T;
        if (url.includes("/article-metadata-index"))
          return {
            publicArticleMetadataIndex: {
              ready: true,
              total: 8,
              builtAt: "2026-10-01T00:00:00Z",
            },
          } as T;
        if (url.endsWith("/preview") || url.endsWith("/preview-thumbnail"))
          return { url: syntheticImageUrl } as T;
        if (url.includes("/media")) {
          const query =
            new URL(url, "http://preview.local").searchParams
              .get("q")
              ?.toLowerCase() ?? "";
          const matches =
            scenario !== "empty" &&
            (!query || "studio-notes.jpg studio notes".includes(query));
          return {
            items: !matches
              ? []
              : [
                  {
                    id: "sample",
                    filename: "studio-notes.jpg",
                    contentType: "image/jpeg",
                    size: 42000,
                    alt: "Studio notes",
                    caption: "",
                    metadata: {},
                    createdAt: "2026-10-01T00:00:00Z",
                    ready: true,
                    deleted: false,
                    previewUrl: syntheticImageUrl,
                  },
                ],
            total: matches ? 1 : 0,
            nextOffset: null,
          } as T;
        }
        throw new Error("No preview fixture is available for this request.");
      },
    [scenario, screen, articleScenario],
  );
  const previewContent = useMemo(() => {
    const rows =
      scenario === "populated"
        ? screen === "documents"
          ? articles.map((article) => ({
              ...article,
              draft: { ...article.draft, key: `content.${article.id}` },
            }))
          : articles
        : [];
    return { rows, recordCount: rows.length, activeCount: rows.length };
  }, [scenario, screen]);
  return (
    <>
      <PreviewToolbar
        subtitle="Synthetic data · local preview"
        note="Workspace links and logout are disabled."
      >
        <PreviewDropdown
          label="Screen"
          value={screen}
          options={[
            { value: "project-picker", label: "Choose a project" },
            { value: "account", label: "Your account" },
            { value: "project-admin", label: "Project administration" },
            { value: "project-create", label: "Create a project (non-admin)" },
            { value: "platform-accounts", label: "Platform accounts" },
            { value: "platform-account-create", label: "Create platform account" },
            { value: "platform-account-reset", label: "Reset platform account password" },
            { value: "overview", label: "Overview" },
            { value: "articles", label: "Articles" },
            { value: "documents", label: "JSON documents" },
            { value: "editor", label: "New article editor" },
            { value: "existing-article", label: "Existing article editor" },
            { value: "new-document", label: "New JSON document editor" },
            { value: "document-editor", label: "Existing JSON document editor" },
            { value: "media", label: "Media library" },
            { value: "media-details", label: "Media details" },
            { value: "members", label: "Project members" },
            { value: "settings", label: "Settings & API" },
          ]}
          onSelect={(value) => setScreen(value as Screen)}
        />
        <PreviewDropdown
          label="Scenario"
          value={screen === "existing-article" ? articleScenario : scenario}
          options={screen === "existing-article"
            ? [
                { value: "draft", label: "Draft" },
                { value: "published", label: "Published" },
                { value: "history", label: "Revision history" },
              ]
            : [
                { value: "populated", label: "Populated" },
                { value: "empty", label: "Empty" },
                { value: "error", label: "Error" },
              ]}
          onSelect={(value) => {
            if (screen === "existing-article") setArticleScenario(value as ArticleScenario);
            else setScenario(value as Scenario);
          }}
        />
        {!screen.startsWith("platform-") &&
          !["project-picker", "account", "project-admin", "project-create"].includes(screen) && (
            <PreviewDropdown
              label="Workspace role"
              value={previewRole}
              options={[
                { value: "admin", label: "Admin" },
                { value: "editor", label: "Editor" },
                { value: "viewer", label: "Viewer" },
              ]}
              onSelect={(value) => setPreviewRole(value as Role)}
            />
          )}
      </PreviewToolbar>
      <div
        key={`${screen}-${scenario}-${articleScenario}`}
        onAuxClickCapture={(event) => {
          if ((event.target as HTMLElement).closest("a")) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onContextMenuCapture={(event) => {
          if ((event.target as HTMLElement).closest("a"))
            event.preventDefault();
        }}
        onClickCapture={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.closest("a") ||
            target.closest('button[aria-label="Log out"]')
          )
            event.preventDefault();
          if (
            target.closest("a") ||
            target.closest('button[aria-label="Log out"]')
          )
            event.stopPropagation();
        }}
      >
        {screen === "project-picker" ? (
          <ProjectPicker
            actor={actor}
            projects={
              scenario === "empty" ? [] : [{ ...project, role: "admin" }]
            }
          />
        ) : screen === "project-admin" || screen === "project-create" ? (
          <AccountArea
            actor={screen === "project-admin" ? adminActor : actor}
            activeSection="projects"
          >
            {screen === "project-admin" ? (
              <ProjectSettings
                organizationId={actor.organizationId}
                request={previewRequest}
              />
            ) : (
              <ProjectCreationForm request={previewRequest} />
            )}
          </AccountArea>
        ) : screen === "platform-accounts" ||
          screen === "platform-account-create" ||
          screen === "platform-account-reset" ? (
          <AccountArea actor={adminActor} activeSection="platform-accounts">
            {screen === "platform-accounts" ? (
              <PlatformAccountsSettings
                currentUsername={actor.username}
                request={previewRequest}
              />
            ) : screen === "platform-account-create" ? (
              <CreatePlatformAccountSettings
                minimumPasswordLength={15}
                request={previewRequest}
              />
            ) : (
              <ResetPlatformAccountPassword
                currentUsername={actor.username}
                initialUsername="sam@example.test"
                minimumPasswordLength={15}
                request={previewRequest}
              />
            )}
          </AccountArea>
        ) : screen === "account" ? (
          <AccountArea actor={actor} activeSection="account">
            <YourAccountSettings
              minimumPasswordLength={15}
              request={previewRequest}
            />
          </AccountArea>
        ) : (
          <Workspace
            actor={actor}
            role={previewRole}
            project={project}
            view={
              screen === "overview"
                ? []
                : screen === "editor"
                  ? ["articles", "new"]
                  : screen === "existing-article"
                    ? ["articles", "preview-article"]
                    : screen === "new-document"
                      ? ["documents", "new"]
                      : screen === "document-editor"
                        ? ["documents", "preview-document"]
                        : screen === "media-details"
                          ? ["media", "sample"]
                          : [screen]
            }
            previewRequest={previewRequest}
            previewContent={previewContent}
            previewContentError={
              scenario === "error" &&
              (screen === "articles" || screen === "documents")
                ? "Preview data is temporarily unavailable."
                : undefined
            }
            initialMedia={
              screen === "media-details"
                ? {
                    id: "sample",
                    filename: "studio-notes.svg",
                    contentType: "image/svg+xml",
                    size: 192,
                    alt: "Synthetic studio notes",
                    caption: "Preview asset",
                    metadata: { source: "fixture" },
                    createdAt: "2026-10-01T00:00:00Z",
                    ready: true,
                    deleted: false,
                  }
                : null
            }
            initialMediaUrl={
              screen === "media-details" ? syntheticImageUrl : null
            }
            initialDashboard={dashboard}
          />
        )}
      </div>
    </>
  );
}
