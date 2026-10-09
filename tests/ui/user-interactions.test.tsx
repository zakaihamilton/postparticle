// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Select from "@/components/select";

describe("custom select", () => {
  it("opens and changes an option with keyboard input", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Select label="Color theme" value="system" options={[{value:"system",label:"System"},{value:"light",label:"Light"},{value:"dark",label:"Dark"}]} onValueChange={onValueChange} />);
    await user.click(screen.getByRole("combobox", {name:"Color theme"}));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("light");
  });
});
