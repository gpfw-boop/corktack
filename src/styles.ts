import { css } from 'lit'

/*
 * Design notes: the overlay sits on someone else's design, so it stays calm
 * and neutral: system font (no font requests inside a prototype), white
 * surfaces, soft shadows, one blue accent. The pins carry the only strong
 * colour, taken from each author's avatar.
 */

/** Visual tokens. Set on the root overlay; custom properties inherit into every child shadow root. */
export const tokens = css`
  :host {
    --surface: #FFFFFF;
    --text: #1E1E1E;
    --text-secondary: #6B6B6B;
    --border: #E6E6E6;
    --hover: #F3F3F3;
    --accent: #0D99FF;
    --danger: #D92D20;
    --shadow: 0 2px 6px rgb(0 0 0 / 0.08), 0 10px 28px rgb(0 0 0 / 0.12);
    --font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --ease: 140ms ease-out;
    /* A little overshoot, for things that appear or respond to a press. */
    --spring: 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
    --accent-soft: #E7F4FF;
  }
`

/** Shared by every component. */
export const base = css`
  *, *::before, *::after { box-sizing: border-box; }
  button, input, textarea { font: inherit; color: inherit; margin: 0; }
  button { cursor: pointer; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  [hidden] { display: none !important; }
  .icon { display: block; flex: none; }
  .avatar {
    display: grid;
    place-items: center;
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--c);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    user-select: none;
  }
  .icon-button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
  }
  .icon-button:hover { background: var(--hover); color: var(--text); }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition: none !important; animation: none !important; }
  }
`

/** A speech bubble with its tail at the bottom left. The hotspot (2 22) is the tip of the tail. */
const cursorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M2 22V12a10 10 0 1 1 10 10Z" fill="#1E1E1E" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`
const cursor = `url("data:image/svg+xml,${encodeURIComponent(cursorSvg)}") 2 22, crosshair`

/** Injected into the host page so the cursor changes while commenting. */
export const pageCss = `html[data-corktack-commenting], html[data-corktack-commenting] * { cursor: ${cursor} !important; }`
