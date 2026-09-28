import { describe, expect, it } from "vitest";
import {
  LabelPalette,
  legendColour,
  MAX_COLOURED_LABELS,
} from "../src/graph/palette";

describe("graph label palette", () => {
  it("orders by count with deterministic alphabetical ties", () => {
    const first = new LabelPalette(["Z", "A", "Z", "B", "A"]);
    expect(first.legend.map((entry) => entry.label)).toEqual(["A", "Z", "B"]);
    expect(first.legend).toEqual(
      new LabelPalette(["A", "B", "Z", "A", "Z"]).legend,
    );
  });
  it.each(["light", "dark"] as const)(
    "gives distinct colors to supported labels in %s theme",
    (theme) => {
      const labels = Array.from(
        { length: MAX_COLOURED_LABELS },
        (_, index) => `Label${index}`,
      );
      const palette = new LabelPalette(labels);
      expect(
        new Set(labels.map((label) => palette.colour(label, theme))).size,
      ).toBe(MAX_COLOURED_LABELS);
      for (const entry of palette.legend)
        expect(legendColour(entry, theme)).toBe(
          palette.colour(entry.label, theme),
        );
    },
  );
  it("folds overflow and unlabelled nodes without confusing a real Other label", () => {
    const labels = [
      "Other",
      "Other",
      ...Array.from({ length: 10 }, (_, index) => `L${index}`),
      null,
    ];
    const palette = new LabelPalette(labels);
    expect(palette.overflowCount).toBe(3);
    expect(palette.legend.at(-1)).toEqual({
      label: "Other labels",
      count: 4,
      slot: null,
    });
    expect(palette.colour("Other", "dark")).not.toBe(
      palette.colour(null, "dark"),
    );
    expect(palette.colour("missing", "dark")).toBe(
      palette.colour(null, "dark"),
    );
    expect(legendColour(palette.legend.at(-1)!, "dark")).toBe(
      palette.colour(null, "dark"),
    );
  });
  it("handles no labels and different theme palettes", () => {
    expect(new LabelPalette([]).legend).toEqual([]);
    const palette = new LabelPalette(["User"]);
    expect(palette.colour("User", "dark")).not.toBe(
      palette.colour("User", "light"),
    );
  });
});
