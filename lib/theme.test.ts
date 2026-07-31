import { describe, expect, it } from "vitest";
import { CURSOR_RAMP_SIZE, NO_FLASH_SCRIPT, THEMES, cursorColorForId } from "./theme";

describe("THEMES", () => {
    it("has exactly one default, and it is first", () => {
        const defaults = THEMES.filter((t) => t.id === null);
        expect(defaults).toHaveLength(1);
        expect(THEMES[0].id).toBeNull();
    });

    it("has unique ids and labels", () => {
        const ids = THEMES.map((t) => t.id);
        const labels = THEMES.map((t) => t.label);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(labels).size).toBe(labels.length);
    });
});

describe("NO_FLASH_SCRIPT", () => {
    it("inlines every real theme id, so a stored value can be validated", () => {
        for (const { id } of THEMES) {
            if (id) expect(NO_FLASH_SCRIPT).toContain(id);
        }
    });

    it("is wrapped in try/catch — storage throws in some privacy modes", () => {
        expect(NO_FLASH_SCRIPT).toContain("try");
        expect(NO_FLASH_SCRIPT).toContain("catch");
    });

    it("closes every brace it opens, since it is injected as raw HTML", () => {
        const open = (NO_FLASH_SCRIPT.match(/\{/g) || []).length;
        const close = (NO_FLASH_SCRIPT.match(/\}/g) || []).length;
        expect(open).toBe(close);
        expect(NO_FLASH_SCRIPT).not.toContain("</script");
    });
});

describe("cursorColorForId", () => {
    it("returns a palette token reference, not a literal colour", () => {
        expect(cursorColorForId("abc")).toMatch(/^var\(--ms-palette-cursor-[1-6]\)$/);
    });

    it("is stable for the same id", () => {
        expect(cursorColorForId("socket-xyz")).toBe(cursorColorForId("socket-xyz"));
    });

    it("stays inside the ramp for ids of any shape", () => {
        const ids = ["", "a", "ZZZZZZZZZZZZZZZZZZZZ", "🙂", "-".repeat(200), "0"];
        for (const id of ids) {
            const n = Number(cursorColorForId(id).match(/cursor-(\d)/)![1]);
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(CURSOR_RAMP_SIZE);
        }
    });

    it("spreads realistic socket ids across the whole ramp", () => {
        const used = new Set(
            Array.from({ length: 200 }, (_, i) => cursorColorForId(`socket_${i}abcXYZ`)),
        );
        expect(used.size).toBe(CURSOR_RAMP_SIZE);
    });
});
