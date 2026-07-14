/**
 * tests/scrollModel.test.ts — coherent single-scroller guard (DESIGN.md Layout).
 *
 * The app must have exactly ONE scroller: the window, with body + #root growing
 * with content. A regression once pinned the whole chain to `height: 100%`,
 * making #root a viewport-tall box that taller content (the full-time result
 * stack: scoreboard + mini sheet + ticker + BandSlam + StatsScreen + ShareRow)
 * overflowed — a split model where the root box ended at one viewport while the
 * scrollable content ran far past it, so layout coordinates and the fixed pitch
 * paint disagreed below the first screen (phantom-height / dead-scroll).
 *
 * jsdom does no layout, so this asserts the CSS *source* invariants that keep
 * the model coherent rather than measuring scrollHeight at runtime (that was
 * verified manually in-browser: post-fix #root grows to the content height on
 * both draft and result, docSH === rootH, scrollY floor 0, no dead band).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cssPath = fileURLToPath(new URL('../src/app/app.css', import.meta.url));
const css = readFileSync(cssPath, 'utf8');

/** Strip /* … *​/ comments so prose examples never match the selector probes. */
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('scroll model — one window scroller, content-growing chain', () => {
  it('#root is a growing box (min-height), never pinned to height:100%', () => {
    const rootRule = cssNoComments.match(/(^|})\s*#root\s*\{([^}]*)\}/);
    expect(rootRule, '#root rule must exist').toBeTruthy();
    const body = rootRule![2];
    expect(body).toMatch(/min-height\s*:/);
    // A pinned `height: 100%` (or 100vh/100dvh) is what made #root overflow its
    // own box. `min-height` is the allowed floor; a hard `height` is not.
    expect(body).not.toMatch(/[^-]height\s*:\s*100(%|vh|dvh)/);
  });

  it('the global reset never applies a fixed height:100% to body or #root', () => {
    // Guards the exact prior regression: `html, body, #root { height: 100% }`.
    // html may keep height:100% (viewport anchor for the fixed pitch layers),
    // but a rule setting a hard height on body/#root reintroduces the split.
    const heightRules = [...cssNoComments.matchAll(/([^{}]+)\{([^}]*height\s*:\s*100(?:%|vh|dvh)[^}]*)\}/g)];
    for (const [, selectors, decls] of heightRules) {
      // Ignore min-height declarations — only a bare `height:100%` splits the model.
      if (!/[^-]height\s*:\s*100(%|vh|dvh)/.test(';' + decls)) continue;
      expect(
        /body|#root/.test(selectors),
        `bare height:100% must not target body/#root (selector: ${selectors.trim()})`,
      ).toBe(false);
    }
  });

  it('the result screen container declares no fixed height + overflow scroller', () => {
    // The result stack must live in normal document flow under the single
    // window scroller — no inner `height/max-height` + `overflow:auto|scroll`
    // combination that would create a second, competing scroller.
    for (const sel of ['.result-screen--broadcast', '.ticker-stage', '.stats-screen']) {
      const rule = cssNoComments.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`));
      expect(rule, `${sel} rule must exist`).toBeTruthy();
      const decls = rule![1];
      const hasScroll = /overflow(-y)?\s*:\s*(auto|scroll)/.test(decls);
      const hasFixedHeight = /(^|;|\s)(height|max-height)\s*:/.test(decls);
      expect(hasScroll && hasFixedHeight, `${sel} must not be a nested scroller`).toBe(false);
    }
  });
});
