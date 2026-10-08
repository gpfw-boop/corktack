import { LitElement, css, html, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { base } from '../styles'
import { define, initials, plural } from '../util'

/**
 * A teardrop avatar whose pointed corner sits exactly on the anchored point.
 * The host is a zero-size box placed at that point; the pin grows up and to
 * the right from it. On hover or focus it opens into a compact preview,
 * except while its thread is open.
 *
 * Set `--c` (avatar colour) and `--room` (space to the right edge) on the host.
 */
export class CtPin extends LitElement {
  @property() author = ''
  @property() body = ''
  @property({ type: Number }) replies = 0
  @property({ type: Boolean, reflect: true }) active = false
  /** Shown only when resolved comments are switched on, so it's faded. */
  @property({ type: Boolean, reflect: true }) resolved = false
  /** The pin for a comment being written: no preview, not focusable. */
  @property({ type: Boolean }) draft = false

  static styles = [
    base,
    css`
      :host { position: absolute; width: 0; height: 0; }
      /* Drops in from just above its point when it appears. */
      .pin { animation: drop var(--spring); transform-origin: 0 100%; }
      @keyframes drop { from { opacity: 0; transform: translateY(-8px) scale(0.6); } }
      :host(:hover), :host(:focus-within), :host([active]) { z-index: 1; }
      .pin {
        position: absolute;
        left: 0;
        bottom: 0;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        width: max-content;
        max-width: 28px;
        height: 28px;
        padding: 0;
        overflow: hidden;
        border: 2px solid #fff;
        border-radius: 14px 14px 14px 0;
        background: var(--c);
        color: var(--text);
        text-align: left;
        box-shadow: 0 1px 3px rgb(0 0 0 / 0.2), 0 2px 8px rgb(0 0 0 / 0.12);
        pointer-events: auto;
        transition: max-width var(--ease), height var(--ease), padding var(--ease), background-color var(--ease), box-shadow var(--ease);
      }
      :host([resolved]:not(:hover):not(:focus-within):not([active])) .pin { opacity: 0.5; }
      :host([active]) .pin { box-shadow: 0 0 0 2px var(--accent), 0 2px 8px rgb(0 0 0 / 0.16); }
      .pin.preview:focus-visible {
        outline-offset: 0;
        max-width: min(240px, var(--room, 240px));
        height: 48px;
        padding: 4px 12px 4px 4px;
        background: var(--surface);
        box-shadow: var(--shadow);
      }
      /* Touch screens keep :hover after a tap, so only real pointers get the hover preview. */
      @media (hover: hover) {
        .pin.preview:hover {
          max-width: min(240px, var(--room, 240px));
          height: 48px;
          padding: 4px 12px 4px 4px;
          background: var(--surface);
          box-shadow: var(--shadow);
        }
      }
      .text { display: block; min-width: 0; max-width: 192px; white-space: nowrap; }
      .line { display: flex; gap: 6px; align-items: baseline; }
      .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
      .meta { flex: none; font-size: 12px; color: var(--text-secondary); }
      .body { display: block; overflow: hidden; text-overflow: ellipsis; }
    `,
  ]

  render() {
    const avatar = html`<span class="avatar">${this.author ? initials(this.author) : nothing}</span>`
    if (this.draft) return html`<div class="pin" aria-hidden="true">${avatar}</div>`

    const firstLine = this.body.split('\n')[0]
    const replies = this.replies ? plural(this.replies, 'reply', 'replies') : ''
    return html`
      <button
        class=${this.active ? 'pin' : 'pin preview'}
        aria-label=${`${this.author}: ${firstLine}${replies ? `, ${replies}` : ''}`}
        aria-expanded=${String(this.active)}
      >
        ${avatar}
        <span class="text" aria-hidden="true">
          <span class="line">
            <span class="name">${this.author}</span>
            ${replies ? html`<span class="meta">${replies}</span>` : nothing}
          </span>
          <span class="body">${firstLine}</span>
        </span>
      </button>
    `
  }
}

define('ct-pin', CtPin)
