// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/components/navigation-guard", () => ({
  GuardedLink: ({
    href,
    ...props
  }: { href: string } & Record<string, unknown>) =>
    createElement("a", { href, ...props }),
  useUnsavedChanges: () => undefined,
}));

import Editor from "@/components/editor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("media publish confirmation", () => {
  it("confirms before making referenced media public", async () => {
    const user = userEvent.setup();
    const mediaId = "550e8400-e29b-41d4-a716-446655440099";
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: mediaId,
            filename: "cover.png",
            contentType: "image/png",
            size: 45,
            alt: "",
            caption: "",
            metadata: {},
            createdAt: "2026-10-11T00:00:00.000Z",
            ready: true,
            deleted: false,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <Editor kind="articles" id="new" projectId="journal" canEdit={true} />,
    );

    const coverPicker = await screen.findByRole("combobox", {
      name: "Cover image",
    });
    await user.click(coverPicker);
    await user.click(await screen.findByRole("option", { name: "cover.png" }));
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining("copy 1 referenced media asset to public URLs"),
      ),
    );
    expect(confirm.mock.calls[0][0]).toContain(
      "unpublishing does not revoke them",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("confirms from payload references even before the media list is available", async () => {
    const user = userEvent.setup();
    const mediaId = "550e8400-e29b-41d4-a716-446655440099";
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <Editor kind="articles" id="new" projectId="journal" canEdit={true} />,
    );
    await user.type(screen.getByLabelText("Title"), "A media story");
    await user.type(screen.getByLabelText("Author"), "Editor");
    await user.type(
      screen.getByLabelText("Article body"),
      `![cover](media:${mediaId})`,
    );
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining("copy 1 referenced media asset to public URLs"),
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
