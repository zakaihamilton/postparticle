// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Select from "@/components/select";
import { ContentList } from "@/components/content-list";
import { Members } from "@/components/settings/members";

afterEach(() => vi.unstubAllGlobals());

describe("custom select", () => {
  it("opens and changes an option with keyboard input", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select
        label="Color theme"
        value="system"
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Color theme" }));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("light");
  });
});

describe("member account and grant status", () => {
  it("shows disabled accounts separately from inactive project grants", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              username: "suspended",
              disabled: true,
              accessActive: true,
              role: "editor",
            },
            {
              username: "former-editor",
              disabled: false,
              accessActive: false,
              role: "editor",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<Members projectId="journal" />);

    expect(await screen.findByText("suspended")).toBeTruthy();
    expect(await screen.findByText("former-editor")).toBeTruthy();
    expect(screen.getByText("Disabled")).toBeTruthy();
    expect(screen.getByText("Inactive")).toBeTruthy();
  });
});

describe("content list preview errors", () => {
  it("keeps the simulated failure visible on retry without making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(
      <ContentList
        kind="documents"
        projectId="preview"
        canEdit
        previewError="Preview data is temporarily unavailable."
      />,
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      screen.getByText("Preview data is temporarily unavailable."),
    ).toBeTruthy();
    expect(screen.getByText("Content could not be loaded.")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
});
