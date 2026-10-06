import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HouseholdProvider } from "@/components/layout/HouseholdProvider";
import { HouseholdPanel } from "@/components/layout/HouseholdPanel";
import { PeriodTable } from "@/components/periods/PeriodTable";
import { PeriodView } from "@/components/periods/PeriodView";
import { SharedShell } from "@/components/share/SharedShell";
import { localRepository } from "@/lib/repository/local";
import {
  createFirestoreRepository,
  firestoreRepository,
} from "@/lib/repository/firestore";
import { buildShareUrl } from "@/lib/share/links";
import type { ExpensePeriod } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
}));

vi.mock("@/lib/repository/firestore", () => ({
  firestoreRepository: { resolveShareLink: vi.fn() },
  createFirestoreRepository: vi.fn(),
}));

const resolveShareLink = firestoreRepository.resolveShareLink as Mock;
const createSharedRepository = createFirestoreRepository as Mock;

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

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

async function createPeriod(partial: Partial<ExpensePeriod> & { name: string }) {
  return localRepository.createPeriod({
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    ...partial,
  });
}

describe("share links", () => {
  it("builds a token-only share URL, tolerating a trailing slash", () => {
    expect(buildShareUrl("https://1stsplit.web.app", "abc123")).toBe(
      "https://1stsplit.web.app/share/abc123",
    );
    expect(buildShareUrl("https://1stsplit.web.app/", "abc123")).toBe(
      "https://1stsplit.web.app/share/abc123",
    );
  });

  it("creates, resolves, lists newest-first, and revokes links", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const hid = (await localRepository.getHousehold())!.id;
    const period = await createPeriod({ name: "September" });

    expect(await localRepository.listShareLinks()).toHaveLength(0);

    const first = await localRepository.createShareLink(period.id);
    expect(first.token.length).toBeGreaterThan(16);
    expect(first.householdId).toBe(hid);
    expect(first.periodId).toBe(period.id);
    expect(first.token).not.toBe((await localRepository.createShareLink(null)).token);

    const listed = await localRepository.listShareLinks();
    expect(listed).toHaveLength(2);
    expect(listed[0]!.createdAt).toBeGreaterThanOrEqual(listed[1]!.createdAt);

    expect(await localRepository.resolveShareLink(first.token)).toEqual(
      expect.objectContaining({ token: first.token, periodId: period.id }),
    );
    expect(await localRepository.resolveShareLink("no-such-token")).toBeNull();

    await localRepository.deleteShareLink(first.token);
    expect(await localRepository.resolveShareLink(first.token)).toBeNull();
    expect(await localRepository.listShareLinks()).toHaveLength(1);
  });

  it("revokes a link from the Share dialog", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    render(
      <HouseholdProvider repository={localRepository}>
        <PeriodView periodId={period.id} />
      </HouseholdProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^share$/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /^share$/i }));
    await user.click(await screen.findByRole("button", { name: /^create link$/i }));
    await screen.findByRole("button", { name: /copy share link/i });

    const [link] = await localRepository.listShareLinks();
    await user.click(screen.getByRole("button", { name: /^revoke$/i }));
    await waitFor(() =>
      expect(screen.getByText(/no share links yet/i)).toBeInTheDocument(),
    );
    expect(await localRepository.resolveShareLink(link!.token)).toBeNull();
  });

  it("greys out every write control on the shared home page", async () => {
    await seedHousehold(["Alex", "Sam"]);
    await createPeriod({ name: "September" });

    render(
      <HouseholdProvider repository={localRepository} readOnly basePath="/share/tok">
        <PeriodTable />
        <HouseholdPanel />
      </HouseholdProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /expense periods for test household/i }),
      ).toBeInTheDocument(),
    );
    // Greyed out, not hidden.
    expect(screen.getByRole("button", { name: /create expense period/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^add member$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /delete september/i })).toBeDisabled();
    // Member names are plain text — no rename affordance.
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rename/i })).not.toBeInTheDocument();
    // Period links stay inside the shared view.
    expect(screen.getByRole("link", { name: "September" }).getAttribute("href")).toBe(
      "/share/tok/period/" +
        (await localRepository.listPeriods())[0]!.id,
    );
  });

  it("greys out every write control on a shared in-progress period", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });

    const user = userEvent.setup();
    render(
      <HouseholdProvider repository={localRepository} readOnly basePath="/share/tok">
        <PeriodView periodId={period.id} />
      </HouseholdProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /add expense/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /add expense/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^share$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete period/i })).toBeDisabled();
    // Period rename is disabled too.
    expect(screen.getByRole("button", { name: "September" })).toBeDisabled();
    // Settling is disabled on the Settlement tab.
    await user.click(screen.getByRole("tab", { name: /settlement/i }));
    expect(screen.getByRole("button", { name: /settle period/i })).toBeDisabled();
  });

  it("greys out reopen on a shared settled period", async () => {
    await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });
    await localRepository.updatePeriod(period.id, { status: "settled", settledAt: Date.now() });

    render(
      <HouseholdProvider
        repository={localRepository}
        readOnly
        basePath="/share/tok"
        homePath="/share/tok/periods"
      >
        <PeriodView periodId={period.id} />
      </HouseholdProvider>,
    );

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /reopen period/i })).toHaveLength(2),
    );
    for (const button of screen.getAllByRole("button", { name: /reopen period/i })) {
      expect(button).toBeDisabled();
    }
    // The back link returns to the shared list, not the owner's.
    expect(screen.getByRole("link", { name: /all expense periods/i }).getAttribute("href")).toBe(
      "/share/tok/periods",
    );
  });

  it("lands directly on the linked period, showing its transfers", async () => {
    const [alex, sam] = await seedHousehold(["Alex", "Sam"]);
    const period = await createPeriod({ name: "September" });
    await localRepository.createExpense({
      periodId: period.id,
      date: "2026-01-15",
      name: "Groceries",
      description: "",
      amountMinor: 9000,
      isPrePaid: false,
      paidBy: null,
      categoryId: "other",
      splitMode: "equal",
      participants: [alex!, sam!],
      splitEntries: [],
      sharesMinor: { [alex!]: 4500, [sam!]: 4500 },
      excluded: false,
    });
    await localRepository.updatePeriod(period.id, { status: "settled", settledAt: Date.now() });
    const hid = (await localRepository.getHousehold())!.id;
    resolveShareLink.mockResolvedValue({
      token: "live-token",
      householdId: hid,
      periodId: period.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    createSharedRepository.mockReturnValue(localRepository);

    render(
      <SharedShell token="live-token">
        {(link) =>
          link.periodId ? (
            <PeriodView periodId={link.periodId} />
          ) : (
            <p>shared list</p>
          )
        }
      </SharedShell>,
    );

    // The settled period renders directly: transfers on top, no tabs, no list.
    expect(await screen.findByText(/household account/i)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText("shared list")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /all expense periods/i }).getAttribute("href")).toBe(
      "/share/live-token/periods",
    );
  });

  it("shows the revoked-link state when the token does not resolve", async () => {
    resolveShareLink.mockResolvedValue(null);

    render(
      <SharedShell token="dead-token">
        <p>should never render</p>
      </SharedShell>,
    );

    expect(await screen.findByText(/revoked/i)).toBeInTheDocument();
    expect(screen.queryByText("should never render")).not.toBeInTheDocument();
    expect(resolveShareLink).toHaveBeenCalledWith("dead-token");
  });

  it("renders the shared home read-only once the token resolves", async () => {
    await seedHousehold(["Alex", "Sam"]);
    await createPeriod({ name: "September" });
    const hid = (await localRepository.getHousehold())!.id;
    resolveShareLink.mockResolvedValue({
      token: "live-token",
      householdId: hid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    createSharedRepository.mockReturnValue(localRepository);

    render(
      <SharedShell token="live-token">
        <PeriodTable />
        <HouseholdPanel />
      </SharedShell>,
    );

    // The banner names the mode, and the household renders greyed out.
    expect(await screen.findByText(/read-only copy/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /expense periods for test household/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create expense period/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^add member$/i })).toBeDisabled();
    expect(createSharedRepository).toHaveBeenCalledWith({ householdId: hid });
  });
});
