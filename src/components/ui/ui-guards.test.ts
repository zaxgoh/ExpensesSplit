import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guards the shadcn primitives against registry overwrites.
 *
 * `npx shadcn@latest add <component>` rewrites existing files in
 * `src/components/ui/` from the upstream registry. That silently reverted the
 * 44px control sizing required by PLAN.md section 6, so it is asserted here.
 */

const ui = (name: string) =>
  readFileSync(resolve(process.cwd(), "src/components/ui", name), "utf8");

describe("44px control sizing", () => {
  it("buttons are 44px tall by default", () => {
    const source = ui("button.tsx");
    expect(source).toContain("h-11");
    // The registry default of h-8 must not come back.
    expect(source).not.toMatch(/default:\s*\n?\s*"h-8/);
    expect(source).not.toMatch(/sm:\s*"h-7/);
  });

  it("inputs are 44px tall", () => {
    const source = ui("input.tsx");
    expect(source).toContain("h-11");
    expect(source).not.toMatch(/"h-8 w-full/);
  });

  it("select triggers are 44px tall", () => {
    const source = ui("select.tsx");
    expect(source).toContain("data-[size=default]:h-11");
  });

  it("checkboxes are 20px with a 44px hit area", () => {
    const source = ui("checkbox.tsx");
    expect(source).toContain("size-5");
    expect(source).toContain("after:-inset-3");
  });
});

describe("no animation library", () => {
  it("does not depend on framer-motion or motion", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(all["framer-motion"]).toBeUndefined();
    expect(all["motion"]).toBeUndefined();
  });
});

describe("date picker", () => {
  it("uses the shadcn Calendar with month and year dropdowns", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/layout/DatePicker.tsx"),
      "utf8",
    );
    // The raw DayPicker was used before and rendered cramped with arrows only.
    expect(source).toContain('from "@/components/ui/calendar"');
    expect(source).not.toContain('from "react-day-picker"');
    expect(source).toContain('captionLayout="dropdown"');
  });
});
