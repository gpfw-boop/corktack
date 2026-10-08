import { LitElement, css, html, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { eye, eyeOff, list, messageCircle, x } from '../icons'
import { base } from '../styles'
import { define } from '../util'

export type ToolbarAction = 'comment' | 'visibility' | 'list' | 'close'

/** Floating toolbar, bottom centre. Fires `ct-action` with the action name. */
export class CtToolbar extends LitElement {
  @property({ type: Boolean }) commenting = false
  @property({ type: Boolean }) visible = true
  @property({ type: Boolean }) listOpen = false

  static styles = [
    base,
    css`
      :host {
        position: fixed;
        left: 50%;
        bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        transform: translateX(-50%);
        display: flex;
        gap: 6px;
        padding: 6px;
        background: var(--surface);
        border-radius: 16px;
        box-shadow: var(--shadow);
        pointer-events: auto;
      }
      .wrap { position: relative; }
      .divider { width: 1px; margin: 6px 0; background: var(--border); }
      button {
        display: grid;
        place-items: center;
        width: 37px;
        height: 37px;
        padding: 0;
        border: 0;
        border-radius: 11px;
        background: transparent;
        color: var(--text);
        transition: transform var(--spring), background-color var(--ease), box-shadow var(--ease);
      }
      .icon { width: 18px; height: 18px; stroke-width: 1.75; }
      button:hover { background: var(--hover); transform: translateY(-2px); }
      button:active { transform: scale(0.9); }
      button[aria-pressed="true"] { background: var(--text); color: #fff; }
      /* The comment tool is the main one, so it's tinted even when off. */
      .comment { background: var(--accent-soft); color: var(--accent); }
      .comment:hover { background: #D3EBFF; }
      .comment[aria-pressed="true"] {
        background: var(--accent);
        color: #fff;
        box-shadow: 0 0 0 4px rgb(13 153 255 / 0.2);
        animation: pop var(--spring);
      }
      @keyframes pop { 50% { transform: scale(1.15); } }
      .tip {
        position: absolute;
        bottom: calc(100% + 12px);
        left: 50%;
        transform: translate(-50%, 4px);
        padding: 5px 9px;
        border-radius: 8px;
        background: var(--text);
        color: #fff;
        font-size: 12px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity var(--ease), transform var(--spring);
      }
      .tip kbd { font: inherit; opacity: 0.7; margin-left: 6px; }
      .wrap:hover .tip, button:focus-visible + .tip { opacity: 1; transform: translate(-50%, 0); }
      @media (prefers-reduced-motion: reduce) {
        button:hover, button:active { transform: none; }
      }
    `,
  ]

  /** `pressed` is null for buttons that act once rather than toggle. */
  private button(action: ToolbarAction, label: string, key: string | null, pressed: boolean | null, icon: unknown) {
    return html`<div class="wrap">
      <button
        class=${action}
        aria-label=${label}
        aria-keyshortcuts=${key ?? nothing}
        aria-pressed=${pressed === null ? nothing : String(pressed)}
        @click=${() => this.dispatchEvent(new CustomEvent('ct-action', { detail: action, bubbles: true, composed: true }))}
      >${icon}</button>
      <span class="tip" aria-hidden="true">${label}${key ? html`<kbd>${key}</kbd>` : nothing}</span>
    </div>`
  }

  render() {
    return html`
      ${this.button('comment', 'Comment', 'C', this.commenting, messageCircle)}
      ${this.button('visibility', this.visible ? 'Hide comments' : 'Show comments', 'Shift+C', !this.visible, this.visible ? eye : eyeOff)}
      ${this.button('list', this.listOpen ? 'Hide comments list' : 'Show comments list', null, this.listOpen, list)}
      <span class="divider" aria-hidden="true"></span>
      ${this.button('close', 'Turn off comments', null, null, x)}
    `
  }
}

define('ct-toolbar', CtToolbar)
