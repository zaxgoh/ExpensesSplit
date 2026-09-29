"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { DatePicker } from "@/components/layout/DatePicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { computeShares, DEFAULT_SPLIT_MODE, SPLIT_MODES } from "@/lib/split/engine";
import { formatMoney, parseMoneyToMinor } from "@/lib/money/minorUnits";
import type { Expense, Member } from "@/types";
import type { ISODate, SplitEntry } from "@/types";

const MODE_LABEL: Record<string, string> = {
  equal: "Equal",
  exact: "Exact",
  percent: "Percentage",
};

const MODE_HINT: Record<string, string> = {
  equal: "Split evenly between the selected members.",
  exact: "Enter the exact amount each member owes.",
  percent: "Percentages must total 100%.",
};

type Props = {
  period: { startDate: ISODate; endDate: ISODate; status: string };
  members: Member[];
  initial?: Expense | null;
  onSubmit: (input: {
    date: ISODate;
    name: string;
    description: string;
    amountMinor: number;
    isPrePaid: boolean;
    paidBy: string | null;
    splitMode: string;
    participants: string[];
    splitEntries: SplitEntry[];
    sharesMinor: Record<string, number>;
  }) => Promise<void>;
  onCancel: () => void;
};

function todayISO(): ISODate {
  return format(new Date(), "yyyy-MM-dd");
}

/** F5: the add/edit expense form. */
export function AddExpenseForm({ period, members, initial, onSubmit, onCancel }: Props) {
  const settled = period.status === "settled";
  const live = useMemo(() => members.filter((m) => !m.archived), [members]);

  const [date, setDate] = useState<ISODate>(
    initial?.date ?? clampToday(period.startDate, period.endDate),
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amountText, setAmountText] = useState(
    initial ? (initial.amountMinor / 100).toFixed(2) : "",
  );
  const [isPrePaid, setIsPrePaid] = useState(initial?.isPrePaid ?? false);
  const [frontedBy, setFrontedBy] = useState<string>(initial?.paidBy ?? live[0]?.id ?? "");
  const [mode, setMode] = useState<string>(initial?.splitMode ?? DEFAULT_SPLIT_MODE);
  const [participants, setParticipants] = useState<string[]>(
    initial?.participants ?? live.map((m) => m.id),
  );
  const [entries, setEntries] = useState<SplitEntry[]>(initial?.splitEntries ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amountMinor = parseMoneyToMinor(amountText) ?? 0;
  const allMemberIds = useMemo(() => live.map((m) => m.id), [live]);

  /**
   * Pre-paid expenses hide the split controls. The split is then always equal
   * across every member, which is what produces "Alex -$45, Sam +$45" for a $90
   * shop fronted by Alex: the account owes her the full $90, and her own $45
   * share cancels against it.
   */
  const effectiveMode = isPrePaid ? "equal" : mode;
  const effectiveParticipants = isPrePaid ? allMemberIds : participants;

  // Seed per-member inputs from the equal split so the user adjusts rather than
  // types from scratch. This is an effect, not a useMemo: it calls setEntries,
  // and a render-phase update would force an extra render pass on every keystroke.
  const participantKey = effectiveParticipants.join(",");
  useEffect(() => {
    if (effectiveMode === "equal" || effectiveParticipants.length === 0 || amountMinor === 0) {
      setEntries([]);
      return;
    }
    const equalShares = computeShares({
      amountMinor,
      mode: "equal",
      participants: effectiveParticipants,
      entries: [],
    }).shares;
    setEntries((current) => {
      if (current.length > 0) {
        const covered = effectiveParticipants.every((id) =>
          current.some((e) => e.memberId === id),
        );
        if (covered) return current;
      }
      return effectiveParticipants.map((memberId) => ({
        memberId,
        valueMinor: effectiveMode === "exact" ? equalShares[memberId] : null,
        percentBps:
          effectiveMode === "percent"
            ? Math.round(10000 / effectiveParticipants.length / 100) * 100
            : null,
      }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMode, participantKey, amountMinor]);

  const result = useMemo(
    () =>
      computeShares({
        amountMinor,
        mode: effectiveMode as never,
        participants: effectiveParticipants,
        entries,
      }),
    [amountMinor, effectiveMode, effectiveParticipants, entries],
  );

  const blocked = settled || saving;
  const frontingMember = live.find((m) => m.id === frontedBy);

  async function submit() {
    if (settled) return;
    if (!name.trim()) return setError("Name is required.");
    if (amountMinor === 0) return setError("Enter an amount greater than zero.");
    if (date < period.startDate || date > period.endDate) {
      return setError(
        `Date must fall within the period (${period.startDate} to ${period.endDate}).`,
      );
    }
    if (isPrePaid && !frontedBy) return setError("Choose who fronted this expense.");
    if (result.error) return setError(result.error);

    setSaving(true);
    try {
      await onSubmit({
        date,
        name: name.trim(),
        description: description.trim(),
        amountMinor,
        isPrePaid,
        paidBy: isPrePaid ? frontedBy : null,
        splitMode: effectiveMode,
        participants: effectiveParticipants,
        splitEntries: entries,
        sharesMinor: result.shares,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the expense.");
      setSaving(false);
    }
  }

  function updateEntry(memberId: string, patch: Partial<SplitEntry>) {
    setEntries((current) =>
      current.map((entry) => (entry.memberId === memberId ? { ...entry, ...patch } : entry)),
    );
  }

  if (settled) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
        This period is settled. Reopen it to add, edit or delete expenses.
      </div>
    );
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
        <div className="grid gap-2.5">
          <Label htmlFor="expense-date">Date</Label>
          <DatePicker
            id="expense-date"
            value={date}
            onChange={setDate}
            min={period.startDate}
            max={period.endDate}
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="expense-amount">Amount</Label>
          <Input
            id="expense-amount"
            inputMode="decimal"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            placeholder="0.00"
            className="tnum"
          />
        </div>
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="expense-name">Name</Label>
        <Input
          id="expense-name"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Electricity bill"
        />
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="expense-description">Description</Label>
        <Input
          id="expense-description"
          value={description}
          maxLength={280}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional"
        />
      </div>

      {/* Prepaid is a single checkbox: it is the only control, and it reveals
          the "Fronted by" picker. isPrePaid and paidBy can never disagree. */}
      <div className="grid gap-4 rounded-xl border p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="expense-prepaid"
            checked={isPrePaid}
            onCheckedChange={(checked) => {
              setIsPrePaid(checked === true);
              if (checked && !frontedBy) setFrontedBy(live[0]?.id ?? "");
            }}
          />
          <div className="grid gap-1">
            <Label htmlFor="expense-prepaid" className="text-base">
              Prepaid by a member
            </Label>
            <p className="text-sm text-muted-foreground">
              {isPrePaid
                ? `${frontingMember?.name ?? "This member"} paid this personally. The account will reimburse them.`
                : "Paid from the household account. Each member owes their share into the account."}
            </p>
          </div>
        </div>

        {isPrePaid ? (
          <div className="grid gap-2.5 border-t pt-4">
            <Label htmlFor="expense-fronted-by">Fronted by</Label>
            <Select value={frontedBy} onValueChange={setFrontedBy}>
              <SelectTrigger id="expense-fronted-by" className="w-full sm:w-72">
                <SelectValue placeholder="Choose a member" />
              </SelectTrigger>
              <SelectContent>
                {live.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.avatar} {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {/* Split section. Hidden entirely when prepaid, per the confirmed model. */}
      {isPrePaid ? null : (
        <div className="grid gap-5 rounded-xl border p-4">
          <div className="grid gap-2.5 sm:max-w-xs">
            <Label htmlFor="expense-split-mode">Mode of splitting</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger id="expense-split-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPLIT_MODES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {MODE_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{MODE_HINT[mode]}</p>
          </div>

          <fieldset className="grid gap-3 border-t pt-4">
            <legend className="text-sm font-medium text-muted-foreground">Split among</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {live.map((member) => {
                const id = `participant-${member.id}`;
                const checked = participants.includes(member.id);
                return (
                  <label
                    key={member.id}
                    htmlFor={id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3 py-2 hover:bg-secondary/60 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/10"
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(next) =>
                        setParticipants((current) =>
                          next === true
                            ? [...current, member.id]
                            : current.filter((existing) => existing !== member.id),
                        )
                      }
                    />
                    <span className="text-base" aria-hidden>
                      {member.avatar}
                    </span>
                    <span className="text-base">{member.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {mode !== "equal" && participants.length > 0 && amountMinor > 0 ? (
            <div className="grid gap-3 border-t pt-4">
              {participants.map((memberId) => {
                const member = live.find((m) => m.id === memberId);
                const entry = entries.find((e) => e.memberId === memberId);
                return (
                  <div key={memberId} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-base">
                      <span aria-hidden className="mr-1.5">
                        {member?.avatar}
                      </span>
                      {member?.name ?? "Removed member"}
                    </span>
                    <Input
                      className="tnum"
                      inputMode="decimal"
                      aria-label={
                        mode === "percent"
                          ? `Percentage for ${member?.name ?? "member"}`
                          : `Exact amount for ${member?.name ?? "member"}`
                      }
                      value={
                        mode === "percent"
                          ? ((entry?.percentBps ?? 0) / 100)
                              .toFixed(2)
                              .replace(/\.?0+$/, "")
                          : entry?.valueMinor != null
                            ? (entry.valueMinor / 100).toFixed(2)
                            : ""
                      }
                      onChange={(event) => {
                        if (mode === "percent") {
                          const bps = Math.round(Number(event.target.value || "0") * 100);
                          updateEntry(memberId, {
                            percentBps: Number.isFinite(bps) ? bps : null,
                          });
                        } else {
                          updateEntry(memberId, {
                            valueMinor: parseMoneyToMinor(event.target.value) ?? 0,
                          });
                        }
                      }}
                    />
                    <span className="w-4 shrink-0 text-sm text-muted-foreground">
                      {mode === "percent" ? "%" : "$"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div aria-live="polite" className="grid gap-1.5 border-t pt-4">
            <p className="text-sm font-medium">Each member owes into the account</p>
            {participants.length === 0 || amountMinor === 0 ? (
              <p className="text-sm text-muted-foreground">
                Enter an amount and select at least one member.
              </p>
            ) : (
              <ul className="grid gap-0.5">
                {participants.map((memberId) => {
                  const member = live.find((m) => m.id === memberId);
                  return (
                    <li
                      key={memberId}
                      className="flex justify-between text-base tnum"
                    >
                      <span>{member?.name ?? "Removed member"}</span>
                      <span>{formatMoney(result.shares[memberId] ?? 0)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p
              className={
                result.error ? "mt-1 text-sm text-negative" : "mt-1 text-sm text-positive"
              }
            >
              {result.error
                ? result.error
                : amountMinor > 0 && participants.length > 0
                  ? `Balanced — ${formatMoney(amountMinor)} assigned`
                  : "Assigned $0.00 of $0.00"}
            </p>
          </div>
        </div>
      )}

      {/* Pre-paid summary, so the reimbursement is visible before saving. */}
      {isPrePaid && amountMinor > 0 ? (
        <p
          aria-live="polite"
          className="rounded-lg border border-positive/40 bg-positive/10 p-4 text-base"
        >
          The account will reimburse{" "}
          <strong>{frontingMember?.name ?? "this member"}</strong>{" "}
          <strong className="tnum">{formatMoney(amountMinor)}</strong>.{" "}
          {frontingMember ? (
            <>
              Their own share of {formatMoney(result.shares[frontedBy] ?? 0)} is already covered,
              so their balance moves by{" "}
              <strong className="tnum">
                {formatMoney((result.shares[frontedBy] ?? 0) - amountMinor)}
              </strong>
              .
            </>
          ) : null}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
        <Button type="button" variant="outline" onClick={onCancel} disabled={blocked}>
          Cancel
        </Button>
        <Button type="submit" disabled={blocked || result.error !== null}>
          {saving ? "Saving…" : initial ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}

function clampToday(startDate: ISODate, endDate: ISODate): ISODate {
  const today = todayISO();
  if (today < startDate) return startDate;
  if (today > endDate) return endDate;
  return today;
}
