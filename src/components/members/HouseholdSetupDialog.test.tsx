import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HouseholdSetupDialog } from "@/components/members/HouseholdSetupDialog";
import { HouseholdProvider } from "@/components/layout/HouseholdProvider";
import { localRepository } from "@/lib/repository/local";
import { AVATARS } from "@/lib/members/avatars";

async function mountDialog() {
  const user = userEvent.setup();
  render(
    <HouseholdProvider repository={localRepository}>
      <HouseholdSetupDialog open onOpenChange={() => {}} />
    </HouseholdProvider>,
  );
  await waitFor(() => expect(screen.queryByText(/^loading/i)).not.toBeInTheDocument());
  return user;
}

describe("first run setup dialog", () => {
  it("asks for a household name and members, and never for a currency", async () => {
    await mountDialog();
    expect(screen.getByLabelText(/household name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/members/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/currency/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/currency/i)).not.toBeInTheDocument();
  });

  it("requires at least two members before continuing", async () => {
    const user = await mountDialog();
    await user.type(screen.getByLabelText(/household name/i), "Maple Street");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least two members/i);
  });

  it("rejects a duplicate member name", async () => {
    const user = await mountDialog();
    const field = screen.getByLabelText(/members/i);
    await user.type(field, "Alex");
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.getByText("Alex")).toBeInTheDocument();

    await user.type(field, "Alex");
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already added/i);
  });

  it("previews a distinct avatar per member as they are added", async () => {
    const user = await mountDialog();
    const field = screen.getByLabelText(/members/i);
    await user.type(field, "Alex");
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await user.type(field, "Sam");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    const alex = screen.getByText("Alex").closest("li");
    const sam = screen.getByText("Sam").closest("li");
    expect(alex).toHaveTextContent(AVATARS[0]);
    expect(sam).toHaveTextContent(AVATARS[1]);
  });

  it("creates the household and members with no currency stored", async () => {
    const user = await mountDialog();
    await user.type(screen.getByLabelText(/household name/i), "Maple Street");
    for (const name of ["Alex", "Sam"]) {
      await user.type(screen.getByLabelText(/members/i), name);
      await user.click(screen.getByRole("button", { name: /^add$/i }));
    }
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(async () => {
      const household = await localRepository.getHousehold();
      expect(household?.name).toBe("Maple Street");
    });

    const members = await localRepository.listMembers();
    expect(members.map((m) => m.name)).toEqual(["Alex", "Sam"]);
    // Avatars round-robin, matching the live preview on the chips.
    expect(members.map((m) => m.avatar)).toEqual([AVATARS[0], AVATARS[1]]);
    // No currency field exists anywhere in the stored household.
    expect(JSON.stringify(await localRepository.getHousehold())).not.toMatch(/currency/i);
  });
});
