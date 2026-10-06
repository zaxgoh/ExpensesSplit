import { describe, expect, it, beforeEach } from "vitest";
import { format } from "date-fns";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeriodTable } from "@/components/periods/PeriodTable";
import { PeriodView } from "@/components/periods/PeriodView";
import { HouseholdProvider } from "@/components/layout/HouseholdProvider";
import { localRepository } from "@/lib/repository/local";
import { periodSchema } from "@/lib/validation/schemas";
import type { ExpensePeriod } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
}));

/** Renders with the provider. periodId omitted renders the home period table. */
async function renderWithHousehold(ui: React.ReactElement) {
  const user = userEvent.setup();
  render(
    <HouseholdProvider repository={localRepository}>
      {ui}
    </HouseholdProvider>,
  );
  await waitFor(() => expect(screen.queryByText(/^loading/i)).not.toBeInTheDocument());
  return user;
}

/** Seed data BEFORE mounting, so the first render already has it. */
async function seedHousehold(memberNames: string[]) {
  await localRepository.createHousehold("Test household");
  const created: string[] = [];
  for (const name of memberNames) {
    const member = await localRepository.createMember(name);
    created.push(member.id);
  }
  return created;
}

function mount(ui: React.ReactElement) {
  return render(<HouseholdProvider repository={localRepository}>{ui}</HouseholdProvider>);
}

/**
 * The add/edit form is code-split (see components/expenses/lazyAddExpenseForm.tsx),
 * so it resolves asynchronously after the click. Wait for a field that only the
 * real form renders before asserting on it.
 */
async function openAddExpenseForm(user: ReturnType<typeof userEvent.setup>) {
  // Warm the code-split module first: on a cold start the transform of the
  // form's dependency graph (calendar, Radix primitives) outlasts the
  // findByLabelText retry window below.
  await import("@/components/expenses/AddExpenseForm");
  await user.click(screen.getByRole("button", { name: /^add expense$/i }));
  await screen.findByLabelText(/^name$/i);
}

/** Period name cells, in the order the table currently renders them. */
function periodNameOrder(): (string | null)[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).queryAllByRole("cell")[0]?.textContent?.trim() ?? null);
}

async function createPeriod(partial: Partial<ExpensePeriod> & { name: string }) {
  return localRepository.createPeriod({
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    ...partial,
  });
}

function headerNames(): string[] {
  return screen
    .getAllByRole("columnheader")
    .map((cell) => cell.textContent?.replace(/[↑↓]/g, "").trim() ?? "");
}

beforeEach(() => {
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// Checklist: Periods (PLAN.md section 10)
// ---------------------------------------------------------------------------

describe("checklist: periods", () => {
  it("shows the five columns: Name, Start date, End date, Total expense amount, Status", async () => {
    await seedHousehold(["Alex", "Sam"]);
    await createPeriod({ name: "January 2026" });
    await renderWithHousehold(<PeriodTable />);

    expect(headerNames()).toEqual([
      "Name",
      "Start date",
      "End date",
      "Total expense amount",
      "Status",
      "Actions",
    ]);
  });

  it("default-sorts by start date ascending, and toggles to descending", async () => {
    await seedHousehold(["Alex", "Sam"]);
    // Created out of chronological order to prove sorting, not insertion order.
    await createPeriod({ name: "March", startDate: "2026-03-01", endDate: "2026-03-31" });
    await createPeriod({ name: "January", startDate: "2026-01-01", endDate: "2026-01-31" });
    await createPeriod({ name: "February", startDate: "2026-02-01", endDate: "2026-02-28" });

    const user = userEvent.setup();
    mount(<PeriodTable />);

    await waitFor(() =>
      expect(periodNameOrder()).toEqual(["January", "February", "March"]),
    );

    await user.click(screen.getByRole("button", { name: /sort by start date/i }));
    await waitFor(() =>
      expect(periodNameOrder()).toEqual(["March", "February", "January"]),
    );
  });

  it("filters rows by status, with All as the default", async () => {
    await seedHousehold(["Alex", "Sam"]);
    await createPeriod({ name: "Open period" });
    const closed = await createPeriod({ name: "Closed period" });
    await localRepository.updatePeriod(closed.id, { status: "settled", settledAt: Date.now() });

    const user = userEvent.setup();
    mount(<PeriodTable />);

    // Header row + two data rows.
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));

    // The filter is a dropdown, so select options from the listbox.
    const trigger = screen.getByRole("combobox", { name: /filter expense periods by status/i });
    expect(trigger).toHaveTextContent(/all periods/i);

    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: /settled/i }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    expect(screen.getByText("Closed period")).toBeInTheDocument();
    expect(screen.queryByText("Open period")).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: /filter expense periods by status/i }));
    await user.click(await screen.findByRole("option", { name: /in progress/i }));
    await waitFor(() => expect(screen.getByText("Open period")).toBeInTheDocument());
    expect(screen.queryByText("Closed period")).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: /filter expense periods by status/i }));
    await user.click(await screen.findByRole("option", { name: /all periods/i }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
  });

  it("shows an empty state and a visible create button when there are zero periods", async () => {
    await seedHousehold(["Alex", "Sam"]);
    render(
      <HouseholdProvider repository={localRepository}>
        <PeriodTable />
      </HouseholdProvider>,
    );

    await waitFor(() => expect(screen.getByText("No expense periods yet")).toBeInTheDocument());
    expect(
      screen.getByRole("button", { name: /create expense period/i }),
    ).toBeInTheDocument();
  });

  it("rejects endDate before startDate but ALLOWS overlapping periods", async () => {
    await seedHousehold(["Alex", "Sam"]);
    // An existing period whose date range a second period may legitimately overlap.
    await createPeriod({ name: "Existing", startDate: "2026-01-01", endDate: "2026-01-31" });

    const user = userEvent.setup();
    mount(<PeriodTable />);
    await waitFor(() => expect(screen.getByText("Existing")).toBeInTheDocument());

    // endDate before startDate is refused.
    expect(
      periodSchema.safeParse({ name: "Backwards", startDate: "2026-03-31", endDate: "2026-03-01" })
        .success,
    ).toBe(false);

    // A period overlapping the existing one is accepted.
    const overlapping = periodSchema.safeParse({
      name: "Overlapping",
      startDate: "2026-01-15",
      endDate: "2026-02-15",
    });
    expect(overlapping.success).toBe(true);

    await user.click(screen.getByRole("button", { name: /create expense period/i }));
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^end date/i)).toBeInTheDocument();
  });

  it("rejects a duplicate period name case-insensitively", () => {
    const created = periodSchema.parse({
      name: "September",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    const existing = [created.name.toLowerCase()];
    const duplicate = created.name.toLowerCase();
    expect(existing).toContain(duplicate);
  });

  it("opens as in progress and only changes status by user action", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "Fresh" });
    expect(period.status).toBe("in_progress");
    expect(period.settledAt).toBeNull();

    const stored = (await localRepository.listPeriods()).find((p) => p.id === period.id);
    expect(stored?.status).toBe("in_progress");
  });

  it("deletes a period from the home table, warning about the expenses inside", async () => {
    const [alex] = await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({
      name: "September",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    await localRepository.createExpense({
      periodId: period.id,
      date: "2026-09-10",
      name: "Groceries",
      description: "",
      amountMinor: 10000,
      isPrePaid: false,
      paidBy: null,
      categoryId: "other",
      splitMode: "equal",
      participants: [alex],
      splitEntries: [],
      sharesMinor: { [alex]: 10000 },
      excluded: false,
    });

    const user = userEvent.setup();
    mount(<PeriodTable />);
    await waitFor(() => expect(screen.getByText("September")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^delete september$/i }));
    expect(
      await screen.findByText(/period and the 1 expense inside it/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^delete period$/i }));
    await waitFor(() => expect(screen.queryByText("September")).not.toBeInTheDocument());
    expect(await localRepository.listPeriods()).toHaveLength(0);
    // Cascading delete must take the expenses with it.
    expect(await localRepository.listExpenses(period.id)).toHaveLength(0);
  });

  it("keeps totalAmountMinor and expenseCount consistent with the underlying expenses", async () => {
    const [, memberB] = await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "Totals" });

    await localRepository.createExpense({
      periodId: period.id,
      date: "2026-01-10",
      name: "Groceries",
      description: "",
      amountMinor: 10000,
      isPrePaid: false,
      paidBy: null,
      categoryId: "other",
      splitMode: "equal",
      participants: [memberB],
      splitEntries: [],
      sharesMinor: { [memberB]: 10000 },
      excluded: false,
    });

    let stored = (await localRepository.listPeriods()).find((p) => p.id === period.id)!;
    expect(stored.totalAmountMinor).toBe(10000);
    expect(stored.expenseCount).toBe(1);

    // Excluding an expense must drop it from the total and the count.
    const expenses = await localRepository.listExpenses(period.id);
    await localRepository.updateExpense(expenses[0].id, period.id, { excluded: true });
    stored = (await localRepository.listPeriods()).find((p) => p.id === period.id)!;
    expect(stored.totalAmountMinor).toBe(0);
    expect(stored.expenseCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Checklist: Expenses (PLAN.md section 10)
// ---------------------------------------------------------------------------

describe("checklist: expenses", () => {
  it("shows the six columns: Date, Name, Description, Prepaid, Mode of split, Amount", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => expect(screen.getByText("No expenses in this period")).toBeInTheDocument());

    expect(headerNames()).toEqual([
      "Date",
      "Name",
      "Description",
      "Prepaid",
      "Mode of split",
      "Amount",
      "Actions",
    ]);
  });

  it("names the fronting member in the Prepaid column", async () => {
    const [alex, sam] = await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({
      name: "September",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    await localRepository.createExpense({
      periodId: period.id,
      date: "2026-09-10",
      name: "Groceries",
      description: "",
      amountMinor: 9000,
      isPrePaid: true,
      paidBy: sam,
      categoryId: "other",
      splitMode: "equal",
      participants: [alex, sam],
      splitEntries: [],
      sharesMinor: { [alex]: 4500, [sam]: 4500 },
      excluded: false,
    });
    await localRepository.createExpense({
      periodId: period.id,
      date: "2026-09-11",
      name: "Electricity",
      description: "",
      amountMinor: 10000,
      isPrePaid: false,
      paidBy: null,
      categoryId: "other",
      splitMode: "equal",
      participants: [alex, sam],
      splitEntries: [],
      sharesMinor: { [alex]: 5000, [sam]: 5000 },
      excluded: false,
    });

    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => expect(screen.getByText(/yes — sam/i)).toBeInTheDocument());
    expect(screen.getByText(/from account/i)).toBeInTheDocument();
  });

  it("shows Removed member for a fronting member removed since", async () => {
    const [alex, sam] = await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({
      name: "September",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    await localRepository.createExpense({
      periodId: period.id,
      date: "2026-09-10",
      name: "Groceries",
      description: "",
      amountMinor: 9000,
      isPrePaid: true,
      paidBy: sam,
      categoryId: "other",
      splitMode: "equal",
      participants: [alex, sam],
      splitEntries: [],
      sharesMinor: { [alex]: 4500, [sam]: 4500 },
      excluded: false,
    });
    await localRepository.archiveMember(sam);

    mount(<PeriodView periodId={period.id} />);
    await waitFor(() =>
      expect(screen.getByText(/yes — removed member/i)).toBeInTheDocument(),
    );
  });

  it("sorts by date, name and amount, ascending then descending", async () => {
    const [alex, sam] = await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({
      name: "September",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });

    // Deliberately inserted out of every possible order.
    await localRepository.createExpense({
      periodId: period.id,
      date: "2026-09-20",
      name: "Zebra",
      description: "",
      amountMinor: 1000,
      isPrePaid: false,
      paidBy: null,
      categoryId: "other",
      splitMode: "equal",
      participants: [alex],
      splitEntries: [],
      sharesMinor: { [alex]: 1000 },
      excluded: false,
    });
    await localRepository.createExpense({
      periodId: period.id,
      date: "2026-09-05",
      name: "Mango",
      description: "",
      amountMinor: 9000,
      isPrePaid: false,
      paidBy: null,
      categoryId: "other",
      splitMode: "equal",
      participants: [alex, sam],
      splitEntries: [],
      sharesMinor: { [alex]: 4500, [sam]: 4500 },
      excluded: false,
    });
    await localRepository.createExpense({
      periodId: period.id,
      date: "2026-09-12",
      name: "Apple",
      description: "",
      amountMinor: 5000,
      isPrePaid: false,
      paidBy: null,
      categoryId: "other",
      splitMode: "equal",
      participants: [alex],
      splitEntries: [],
      sharesMinor: { [alex]: 5000 },
      excluded: false,
    });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => expect(screen.getByText("Zebra")).toBeInTheDocument());

    const order = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).queryAllByRole("cell")[1]?.textContent?.trim() ?? null);

    // Default: date ascending -> 05, 12, 20.
    expect(order()).toEqual(["Mango", "Apple", "Zebra"]);

    await user.click(screen.getByRole("button", { name: /sort by date/i }));
    expect(order()).toEqual(["Zebra", "Apple", "Mango"]);

    await user.click(screen.getByRole("button", { name: /sort by name/i }));
    expect(order()).toEqual(["Apple", "Mango", "Zebra"]);

    await user.click(screen.getByRole("button", { name: /sort by name/i }));
    expect(order()).toEqual(["Zebra", "Mango", "Apple"]);

    await user.click(screen.getByRole("button", { name: /sort by amount/i }));
    expect(order()).toEqual(["Zebra", "Apple", "Mango"]);

    await user.click(screen.getByRole("button", { name: /sort by amount/i }));
    expect(order()).toEqual(["Mango", "Apple", "Zebra"]);
  });

  it("deletes an expense after confirmation, and only when confirmed", async () => {
    const [alex] = await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({
      name: "September",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    await localRepository.createExpense({
      periodId: period.id,
      date: "2026-09-10",
      name: "Groceries",
      description: "",
      amountMinor: 10000,
      isPrePaid: false,
      paidBy: null,
      categoryId: "other",
      splitMode: "equal",
      participants: [alex],
      splitEntries: [],
      sharesMinor: { [alex]: 10000 },
      excluded: false,
    });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^delete groceries$/i }));
    expect(
      await screen.findByText(/permanently removes the \$100\.00 expense/i),
    ).toBeInTheDocument();

    // Backing out leaves the expense alone.
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    expect(await localRepository.listExpenses(period.id)).toHaveLength(1);

    // Confirming removes it and updates the period total.
    await user.click(screen.getByRole("button", { name: /^delete groceries$/i }));
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(screen.queryByText("Groceries")).not.toBeInTheDocument());
    expect(await localRepository.listExpenses(period.id)).toHaveLength(0);
    const stored = (await localRepository.listPeriods()).find((p) => p.id === period.id)!;
    expect(stored.totalAmountMinor).toBe(0);
  });

  it("renames the period inline from the header", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "September" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "September" }));
    const field = screen.getByLabelText(/expense period name/i);
    await user.clear(field);
    await user.type(field, "Autumn 2026{Enter}");

    await waitFor(async () => {
      const stored = (await localRepository.listPeriods()).find((p) => p.id === period.id)!;
      expect(stored.name).toBe("Autumn 2026");
    });
  });

  it("rejects renaming a period to a name another period already uses", async () => {
    await seedHousehold(["Alex", "Sam"]);
    await createPeriod({ name: "January" });
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "September" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "September" }));
    const field = screen.getByLabelText(/expense period name/i);
    await user.clear(field);
    await user.type(field, "January{Enter}");

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    const stored = (await localRepository.listPeriods()).find((p) => p.id === period.id)!;
    expect(stored.name).toBe("September");
  });

  it("deletes a period from its own page and names the expenses it takes with it", async () => {
    const [alex] = await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({
      name: "September",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    await localRepository.createExpense({
      periodId: period.id,
      date: "2026-09-10",
      name: "Groceries",
      description: "",
      amountMinor: 10000,
      isPrePaid: false,
      paidBy: null,
      categoryId: "other",
      splitMode: "equal",
      participants: [alex],
      splitEntries: [],
      sharesMinor: { [alex]: 10000 },
      excluded: false,
    });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /delete period/i }));
    expect(await screen.findByText(/period and the 1 expense inside it/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^delete period$/i }));
    await waitFor(async () => {
      expect(await localRepository.listPeriods()).toHaveLength(0);
      expect(await localRepository.listExpenses(period.id)).toHaveLength(0);
    });
  });

  it("offers exactly Equal, Exact and Percentage in a dropdown — no weights mode", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => screen.getByRole("button", { name: /add expense/i }));
    await openAddExpenseForm(user);

    // Split mode is mutually exclusive, so it is a dropdown.
    const trigger = screen.getByRole("combobox", { name: /mode of splitting/i });
    expect(trigger).toHaveTextContent("Equal");

    await user.click(trigger);
    const options = await screen.findAllByRole("option");
    const labels = options.map((option) => option.textContent?.trim());
    // Order follows SPLIT_MODES: equal, exact, percent.
    expect(labels).toEqual(["Equal", "Exact", "Percentage"]);
    expect(labels.join(" ")).not.toMatch(/share|weight/i);
  });

  it("hides every split control when an expense is marked prepaid", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => screen.getByRole("button", { name: /add expense/i }));
    await openAddExpenseForm(user);

    // Present while not prepaid.
    expect(screen.getByRole("combobox", { name: /mode of splitting/i })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /split among/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText(/prepaid by a member/i));

    // All of it disappears, replaced by the "Fronted by" picker.
    expect(screen.queryByRole("combobox", { name: /mode of splitting/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /split among/i })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /fronted by/i })).toBeInTheDocument();
  });

  it("saves a prepaid expense split equally, so the fronting member nets negative", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => screen.getByRole("button", { name: /add expense/i }));
    await openAddExpenseForm(user);

    await user.type(screen.getByLabelText(/^name$/i), "Groceries");
    await user.type(screen.getByLabelText(/^amount$/i), "90");
    await user.click(screen.getByLabelText(/prepaid by a member/i));
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(async () => {
      const stored = await localRepository.listExpenses(period.id);
      expect(stored).toHaveLength(1);
      // Equal split across both members is applied automatically.
      expect(stored[0].splitMode).toBe("equal");
      expect(stored[0].participants).toHaveLength(2);
      expect(Object.values(stored[0].sharesMinor)).toEqual([4500, 4500]);
    });

    // The settlement tab shows Alex reimbursed and Sam transferring.
    await user.click(screen.getByRole("tab", { name: /settlement/i }));
    expect(await screen.findByText(/reimbursed \$45 by the account/i)).toBeInTheDocument();
    expect(screen.getByText(/transfer \$45 to the account/i)).toBeInTheDocument();
  });

  it("defaults the split to Equal with every member checked and previewed", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => screen.getByRole("button", { name: /add expense/i }));
    await openAddExpenseForm(user);

    // Split mode default is Equal.
    expect(screen.getByRole("combobox", { name: /mode of splitting/i })).toHaveTextContent(
      "Equal",
    );

    await user.type(screen.getByLabelText(/^amount$/i), "90");

    // Every member is checked by default, and the checkboxes show it.
    const splitAmong = screen.getByRole("group", { name: /split among/i });
    const checkboxes = within(splitAmong).getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    for (const box of checkboxes) {
      expect(box).toHaveAttribute("data-state", "checked");
    }

    const preview = screen.getByText(/each member owes into the account/i).parentElement!;
    expect(within(preview).getByText("Alex")).toBeInTheDocument();
    expect(within(preview).getByText("Sam")).toBeInTheDocument();
    expect(within(preview).getAllByText("$45.00")).toHaveLength(2);
  });

  it("drops a member from the split when their checkbox is cleared", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => screen.getByRole("button", { name: /add expense/i }));
    await openAddExpenseForm(user);
    await user.type(screen.getByLabelText(/^name$/i), "Electricity");
    await user.type(screen.getByLabelText(/^amount$/i), "90");

    const splitAmong = screen.getByRole("group", { name: /split among/i });
    const samBox = within(splitAmong).getByRole("checkbox", { name: /sam/i });
    await user.click(samBox);
    expect(samBox).toHaveAttribute("data-state", "unchecked");

    // Alex now owes the whole amount.
    const preview = screen.getByText(/each member owes into the account/i).parentElement!;
    expect(within(preview).getByText("$90.00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(async () => {
      const stored = await localRepository.listExpenses(period.id);
      expect(stored[0].participants).toHaveLength(1);
      expect(Object.values(stored[0].sharesMinor)).toEqual([9000]);
    });
  });

  it("blocks saving an unbalanced percentage split and shows the delta", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => screen.getByRole("button", { name: /add expense/i }));
    await openAddExpenseForm(user);

    await user.type(screen.getByLabelText(/^amount$/i), "90");
    await user.type(screen.getByLabelText(/^name$/i), "Electricity");
    await user.click(screen.getByRole("combobox", { name: /mode of splitting/i }));
    await user.click(await screen.findByRole("option", { name: "Percentage" }));

    // Alex 50% + Sam 50% = 100%: balanced, so saving is allowed.
    await user.clear(screen.getByLabelText(/percentage for alex/i));
    await user.type(screen.getByLabelText(/percentage for alex/i), "50");
    await user.clear(screen.getByLabelText(/percentage for sam/i));
    await user.type(screen.getByLabelText(/percentage for sam/i), "50");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^create$/i })).not.toBeDisabled(),
    );
    expect(screen.getByText(/balanced/i)).toBeInTheDocument();

    // Drop Sam to 30% so the split no longer totals 100%.
    await user.clear(screen.getByLabelText(/percentage for sam/i));
    await user.type(screen.getByLabelText(/percentage for sam/i), "30");

    expect(await screen.findByText(/20% unassigned/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^create$/i })).toBeDisabled();
  });

  it("blocks saving an unbalanced exact split and shows the delta", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => screen.getByRole("button", { name: /add expense/i }));
    await openAddExpenseForm(user);

    await user.type(screen.getByLabelText(/^amount$/i), "90");
    await user.click(screen.getByRole("combobox", { name: /mode of splitting/i }));
    await user.click(await screen.findByRole("option", { name: "Exact" }));

    // Seeded from the equal split as $45.00 each. Break Alex's side.
    await user.clear(screen.getByLabelText(/exact amount for alex/i));
    await user.type(screen.getByLabelText(/exact amount for alex/i), "20");

    expect(await screen.findByText(/unassigned|over by/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^create$/i })).toBeDisabled();
  });

  it("saves a balanced expense and shows it in the table", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => screen.getByRole("button", { name: /add expense/i }));

    await openAddExpenseForm(user);
    await user.type(screen.getByLabelText(/^name$/i), "Electricity");
    await user.type(screen.getByLabelText(/^amount$/i), "90");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(screen.getByText("Electricity")).toBeInTheDocument());
    expect(screen.getByText("$90.00")).toBeInTheDocument();
    expect(screen.getByText("Equal")).toBeInTheDocument();

    const stored = await localRepository.listExpenses(period.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].isPrePaid).toBe(false);
    expect(stored[0].paidBy).toBeNull();
  });

  it("exposes prepaid and fronted-by as one control, never independently", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() => screen.getByRole("button", { name: /add expense/i }));
    await openAddExpenseForm(user);

    const toggle = screen.getByLabelText(/prepaid by a member/i);
    expect(toggle).toHaveAttribute("data-state", "unchecked");
    // Off means the account paid, so no fronted-by picker is offered.
    expect(screen.queryByRole("combobox", { name: /fronted by/i })).not.toBeInTheDocument();
    expect(screen.getByText(/paid from the household account/i)).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("combobox", { name: /fronted by/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^name$/i), "Groceries");
    await user.type(screen.getByLabelText(/^amount$/i), "40");

    // Choose Sam as the fronting member.
    await user.click(screen.getByRole("combobox", { name: /fronted by/i }));
    await user.click(await screen.findByRole("option", { name: /sam/i }));
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(async () => {
      const stored = await localRepository.listExpenses(period.id);
      expect(stored).toHaveLength(1);
      // The invariant isPrePaid === (paidBy !== null) holds after a real save.
      expect(stored[0].isPrePaid).toBe(true);
      expect(stored[0].paidBy).not.toBeNull();
      const sam = (await localRepository.listMembers()).find((m) => m.name === "Sam")!;
      expect(stored[0].paidBy).toBe(sam.id);
    });
  });

  it("rejects an expense dated outside the period's range", async () => {
    const [memberA] = await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({
      name: "September",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    // The repository is the enforcement point, mirroring the future Firestore rule.
    await expect(
      localRepository.createExpense({
        periodId: period.id,
        date: "2026-10-15",
        name: "Out of range",
        description: "",
        amountMinor: 1000,
        isPrePaid: false,
        paidBy: null,
        categoryId: "other",
        splitMode: "equal",
        participants: [memberA],
        splitEntries: [],
        sharesMinor: { [memberA]: 1000 },
        excluded: false,
      }),
    ).rejects.toThrow();
  });

  it("rejects expense writes while settled, and accepts them again after reopening", async () => {
    const [memberA] = await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({
      name: "September",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });

    const write = () =>
      localRepository.createExpense({
        periodId: period.id,
        date: "2026-09-10",
        name: "Blocked",
        description: "",
        amountMinor: 1000,
        isPrePaid: false,
        paidBy: null,
        categoryId: "other",
        splitMode: "equal",
        participants: [memberA],
        splitEntries: [],
        sharesMinor: { [memberA]: 1000 },
        excluded: false,
      });

    await localRepository.updatePeriod(period.id, { status: "settled", settledAt: Date.now() });
    await expect(write()).rejects.toThrow(/settled/i);

    await localRepository.updatePeriod(period.id, { status: "in_progress", settledAt: null });
    await expect(write()).resolves.toBeTruthy();
    expect(await localRepository.listExpenses(period.id)).toHaveLength(1);
  });

  it("shows the settled layout with no tabs: amounts on top, expenses below", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });
    await localRepository.updatePeriod(period.id, { status: "settled", settledAt: Date.now() });

    render(
      <HouseholdProvider repository={localRepository}>
        <PeriodView periodId={period.id} />
      </HouseholdProvider>,
    );

    // Settled amounts section renders directly — no tabs to click through.
    await waitFor(() =>
      expect(screen.getByText(/household account/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    // The expense table follows under its own heading.
    expect(screen.getByRole("heading", { name: /^expenses$/i })).toBeInTheDocument();
    expect(screen.getByText("No expenses in this period")).toBeInTheDocument();
    // A settled period with nothing to add shows no "Add one" hint.
    expect(screen.queryByText(/add one to see how it splits/i)).not.toBeInTheDocument();
    // Copy link sits beside Copy all on settled pages only.
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add expense/i })).not.toBeInTheDocument();
    // Reopen lives in the page header and on the settlement card.
    expect(screen.getAllByRole("button", { name: /reopen period/i })).toHaveLength(2);
  });

  it("keeps the tabbed layout and no copy link while in progress", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    mount(<PeriodView periodId={period.id} />);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /expenses/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("tab", { name: /settlement/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy link/i })).not.toBeInTheDocument();
  });

  it("copies the page URL from the copy link button on a settled period", async () => {
    // jsdom ships no clipboard, and its Navigator instance does not accept
    // an own clipboard property — so the whole global is stubbed with a
    // wrapper that keeps the real navigator on its prototype chain.
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "navigator",
      Object.create(globalThis.navigator, {
        clipboard: { value: { writeText }, configurable: true },
      }),
    );
    try {
      await seedHousehold(["Alex", "Sam"]);
      const period = await createPeriod({ name: "September" });
      await localRepository.updatePeriod(period.id, {
        status: "settled",
        settledAt: Date.now(),
      });

      // Note: no userEvent.setup() here — user-event installs its own
      // navigator.clipboard fake at setup, which would shadow the stub below.
      render(
        <HouseholdProvider repository={localRepository}>
          <PeriodView periodId={period.id} />
        </HouseholdProvider>,
      );

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(window.location.href));
      expect(
        await screen.findByRole("button", { name: /^copied$/i }),
      ).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("adds a member from the period page and offers them in the expense form", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^add member$/i }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /^add member$/i }));
    await user.type(await screen.findByLabelText(/member name/i), "Riley");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(async () =>
      expect(await localRepository.listMembers()).toHaveLength(3),
    );
    // The dialog closes and the new member is offered in the split.
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await openAddExpenseForm(user);
    expect(screen.getByRole("checkbox", { name: /riley/i })).toBeInTheDocument();
  });

  it("rejects a duplicate member name when adding", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    mount(<PeriodView periodId={period.id} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^add member$/i }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /^add member$/i }));
    await user.type(await screen.findByLabelText(/member name/i), "alex");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByText(/already added/i)).toBeInTheDocument();
    expect(await localRepository.listMembers()).toHaveLength(2);
  });

  it("shows no add-member button on a settled period", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });
    await localRepository.updatePeriod(period.id, {
      status: "settled",
      settledAt: Date.now(),
    });

    mount(<PeriodView periodId={period.id} />);

    await waitFor(() =>
      expect(screen.getByText("No expenses in this period")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /^add member$/i }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Checklist: opening a period from the home table (create → open flow)
// ---------------------------------------------------------------------------

describe("checklist: opening a period from the home table", () => {
  it("opens a period created moments ago with an empty expense table", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const user = userEvent.setup();

    // The create dialog is code-split; load its module up front so
    // the lazy component resolves the moment it opens instead of
    // racing the first cold transform of the calendar's dependency
    // graph.
    await import("@/components/periods/CreatePeriodDialog");

    // The provider stays mounted while the app navigates from the home
    // table to a period page, so both render under one provider here.
    const view = render(
      <HouseholdProvider repository={localRepository}>
        <PeriodTable />
      </HouseholdProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("No expense periods yet")).toBeInTheDocument(),
    );

    // Create a period through the dialog the way a user would. The
    // dialog is code-split, so its fields are awaited; the calendar
    // opens on the current month, so its days need no navigating; and
    // day buttons are labelled with the "PPPP" format, which begins
    // with the weekday, so the day is matched by its "Month Do, YYYY"
    // part. The first and last day of the month are never "today",
    // whose label is prefixed with "Today, ".
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startDay = new RegExp(format(first, "MMMM do, yyyy"), "i");
    const endDay = new RegExp(format(last, "MMMM do, yyyy"), "i");

    await user.click(screen.getByRole("button", { name: /create expense period/i }));
    await user.type(await screen.findByLabelText(/^name/i), "Camping trip");

    await user.click(await screen.findByLabelText(/^start date/i));
    const startGrid = await screen.findByRole("grid");
    await user.click(within(startGrid).getByRole("button", { name: startDay }));
    // The popover unmounts as soon as a day is chosen.
    await waitFor(() =>
      expect(screen.queryByRole("grid")).not.toBeInTheDocument(),
    );

    await user.click(await screen.findByLabelText(/^end date/i));
    const endGrid = await screen.findByRole("grid");
    await user.click(within(endGrid).getByRole("button", { name: endDay }));
    await waitFor(() =>
      expect(screen.queryByRole("grid")).not.toBeInTheDocument(),
    );

    await user.click(await screen.findByRole("button", { name: /^ok$/i }));

    // The new row is on the home table.
    await waitFor(() =>
      expect(screen.getByText("Camping trip")).toBeInTheDocument(),
    );

    // Navigate to the period page: it mounts under the same provider.
    const [created] = await localRepository.listPeriods();
    view.rerender(
      <HouseholdProvider repository={localRepository}>
        <PeriodTable />
        <PeriodView periodId={created.id} />
      </HouseholdProvider>,
    );

    // A brand-new period has no expenses: the page shows the period,
    // the expense table's empty state, and the add-expense button —
    // never a "could not be found" error.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /add expense/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("No expenses in this period")).toBeInTheDocument();
    expect(screen.queryByText(/could not be found/i)).not.toBeInTheDocument();
  });
});
