import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePicker } from "@/components/layout/DatePicker";

describe("DatePicker", () => {
  it("opens with separate month and year dropdowns, not arrows alone", async () => {
    const user = userEvent.setup();
    render(<DatePicker value="2026-09-15" onChange={() => {}} id="d" />);

    await user.click(screen.getByRole("button", { name: /sep 15, 2026/i }));
    const popover = await screen.findByRole("dialog");

    // Two caption dropdowns: one selects the month, one selects the year.
    expect(within(popover).getAllByRole("combobox")).toHaveLength(2);

    // A full month grid with day cells, not a squeezed list of labels.
    const grid = within(popover).getByRole("grid");
    expect(within(grid).getAllByRole("gridcell").length).toBeGreaterThanOrEqual(28);
  });

  it("reaches a distant year through the year dropdown", async () => {
    const user = userEvent.setup();
    render(<DatePicker value="2026-09-15" onChange={() => {}} id="d" />);

    await user.click(screen.getByRole("button", { name: /sep 15, 2026/i }));
    const popover = await screen.findByRole("dialog");
    // The caption dropdowns are native selects.
    const [monthSelect, yearSelect] = within(popover).getAllByRole("combobox");

    expect((monthSelect as HTMLSelectElement).selectedOptions[0].text).toMatch(/sept/i);
    expect((yearSelect as HTMLSelectElement).value).toBe("2026");

    // The year list spans a usable range rather than only the current year.
    const years = Array.from((yearSelect as HTMLSelectElement).options).map((o) => o.value);
    expect(years).toContain("2020");
    expect(years).toContain("2030");
  });

  it("emits an ISO date when a day is chosen", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DatePicker value="2026-09-15" onChange={onChange} id="d" />);

    await user.click(screen.getByRole("button", { name: /sep 15, 2026/i }));
    const popover = await screen.findByRole("dialog");
    await user.click(
      within(popover).getByRole("button", { name: /september 21st, 2026/i }),
    );

    expect(onChange).toHaveBeenCalledWith("2026-09-21");
  });

  it("disables days outside the supplied range", async () => {
    const user = userEvent.setup();
    render(
      <DatePicker
        value="2026-09-15"
        onChange={() => {}}
        min="2026-09-10"
        max="2026-09-20"
        id="d"
      />,
    );

    await user.click(screen.getByRole("button", { name: /sep 15, 2026/i }));
    const popover = await screen.findByRole("dialog");

    const outside = within(popover).getByRole("button", { name: /september 5th, 2026/i });
    expect(outside).toBeDisabled();
    const inside = within(popover).getByRole("button", { name: /september 12th, 2026/i });
    expect(inside).not.toBeDisabled();
  });

  it("opens on the current month when nothing is selected", async () => {
    const user = userEvent.setup();
    render(<DatePicker value="" onChange={() => {}} id="d" />);

    await user.click(screen.getByRole("button", { name: /select date/i }));
    const popover = await screen.findByRole("dialog");
    const now = new Date();
    const [, yearSelect] = within(popover).getAllByRole("combobox");
    expect((yearSelect as HTMLSelectElement).value).toBe(String(now.getFullYear()));
  });
});
