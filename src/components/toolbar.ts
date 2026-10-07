import { LitElement, css, html, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { eye, eyeOff, list, messageCircle } from '../icons'
import { base } from '../styles'
import { define } from '../util'

export type ToolbarAction = 'comment' | 'visibility' | 'list'

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
        gap: 4px;
        padding: 4px;
        background: var(--surface);
        border-radius: 12px;
        box-shadow: var(--shadow);
        pointer-events: auto;
      }
      .wrap { position: relative; }
      button {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--text);
      }
      button:hover { background: var(--hover); }
      button[aria-pressed="true"] { background: var(--accent); color: #fff; }
      .tip {
        position: absolute;
        bottom: calc(100% + 10px);
        left: 50%;
        transform: translateX(-50%);
        padding: 4px 8px;
        border-radius: 6px;
        background: var(--text);
        color: #fff;
        font-size: 12px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity var(--ease);
      }
      .tip kbd { font: inherit; opacity: 0.7; margin-left: 6px; }
      .wrap:hover .tip, button:focus-visible + .tip { opacity: 1; }
    `,
  ]

  private button(action: ToolbarAction, label: string, key: string | null, pressed: boolean, icon: unknown) {
    return html`<div class="wrap">
      <button
        aria-label=${label}
        aria-keyshortcuts=${key ?? nothing}
        aria-pressed=${String(pressed)}
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
    `
  }
}

define('ct-toolbar', CtToolbar)
