/*
 * The hidden tab: a sliver that peeks up from the bottom edge of every page.
 * Hovering or focusing it slides up a comment button; clicking turns review
 * mode on. On touch screens the first tap reveals it and the second turns
 * comments on, so a stray tap does nothing.
 *
 * It's plain DOM rather than Lit, because it loads for every visitor.
 */

const TAG = 'corktack-launcher'

// Lucide message-circle, as in the toolbar.
const ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path vector-effect="non-scaling-stroke" d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`

const STYLE = `
  :host {
    all: initial;
    position: fixed;
    left: 50%;
    bottom: 0;
    z-index: 2147483000;
    transform: translateX(-50%);
    font: 12px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  /* A generous hover area above the sliver, so it's easy to find with the pointer. */
  .zone { display: flex; flex-direction: column; align-items: center; padding: 24px 32px 0; }
  button {
    position: relative;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin-bottom: -36px;
    padding: 0;
    border: 0;
    border-radius: 14px;
    background: #E7F4FF;
    color: #0D99FF;
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.08), 0 10px 28px rgb(0 0 0 / 0.12);
    cursor: pointer;
    transition: margin-bottom 260ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 140ms ease-out;
  }
  /* The handle is what peeks: a short blue bar, like a pull tab. It fades as the button rises. */
  button::before {
    content: "";
    position: absolute;
    top: 3px;
    left: 50%;
    width: 18px;
    height: 3px;
    border-radius: 2px;
    background: #0D99FF;
    transform: translateX(-50%);
    transition: opacity 140ms ease-out;
  }
  .zone:hover button, button:focus-visible, :host([revealed]) button { margin-bottom: 16px; }
  .zone:hover button::before, button:focus-visible::before, :host([revealed]) button::before { opacity: 0; }
  button:hover { background: #D3EBFF; }
  button:active { background: #0D99FF; color: #fff; }
  button:focus-visible { outline: 2px solid #0D99FF; outline-offset: 2px; }
  .tip {
    order: -1;
    margin-bottom: 8px;
    padding: 5px 9px;
    border-radius: 8px;
    background: #1E1E1E;
    color: #fff;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms ease-out;
  }
  .zone:hover .tip, button:focus-visible ~ .tip { opacity: 1; }
  @media (hover: none) { .tip { display: none; } }
  @media (prefers-reduced-motion: reduce) { button, .tip { transition: none; } }
  @media print { :host { display: none; } }
`

/** Shows the tab. Returns a function that removes it. */
export function mountLauncher(onOpen: () => void): () => void {
  document.querySelector(TAG)?.remove()
  const host = document.createElement(TAG)
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>${STYLE}</style>
    <div class="zone">
      <button type="button" aria-label="Turn on comments">${ICON}</button>
      <span class="tip" aria-hidden="true">Comments</span>
    </div>`

  let hideTimer = 0
  root.querySelector('button')!.addEventListener('click', () => {
    // On touch, reveal first, so brushing the edge of the screen doesn't turn comments on.
    const touch = window.matchMedia?.('(hover: none)').matches
    if (touch && !host.hasAttribute('revealed')) {
      host.setAttribute('revealed', '')
      clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => host.removeAttribute('revealed'), 4000)
      return
    }
    onOpen()
  })
  // Keep presses on the tab away from the prototype's own outside-click handlers.
  for (const type of ['pointerdown', 'mousedown', 'click', 'touchstart']) host.addEventListener(type, (e) => e.stopPropagation())

  document.body.append(host)
  return () => {
    clearTimeout(hideTimer)
    host.remove()
  }
}
