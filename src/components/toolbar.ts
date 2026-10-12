import { LitElement, css, html, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import { eye, eyeOff, list, listChecks, messageCircle } from '../icons'
import { base } from '../styles'
import { define } from '../util'

export type ToolbarAction = 'comment' | 'visibility' | 'list' | 'study'

/**
 * Floating toolbar, bottom centre. Fires `ct-action` with the action name, and
 * `ct-study` with a study id when switching to testing. With several studies,
 * the switch opens a menu of them.
 */
export class CtToolbar extends LitElement {
  @property({ type: Boolean }) commenting = false
  @property({ type: Boolean }) visible = true
  @property({ type: Boolean }) listOpen = false
  @property({ attribute: false }) studies: Array<{ id: string; title: string }> = []
  @state() private menuOpen = false

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
      .menu {
        position: absolute;
        right: 0;
        bottom: calc(100% + 12px);
        display: grid;
        min-width: 200px;
        padding: 4px;
        background: var(--surface);
        border-radius: 12px;
        box-shadow: var(--shadow);
        animation: rise var(--spring);
      }
      @keyframes rise { from { opacity: 0; transform: translateY(6px); } }
      .menu-title { padding: 6px 8px 4px; font-size: 12px; color: var(--text-secondary); }
      .menu button {
        display: block;
        width: 100%;
        height: auto;
        padding: 8px;
        border-radius: 8px;
        text-align: left;
        white-space: nowrap;
      }
      .menu button:hover { transform: none; }
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

  private studySwitch() {
    const several = this.studies.length > 1
    return html`<span class="divider" aria-hidden="true"></span>
      <div class="wrap" @focusout=${(e: FocusEvent) => {
        if (!(e.currentTarget as Element).contains(e.relatedTarget as Node)) this.menuOpen = false
      }}>
        <button
          class="study"
          aria-label="Switch to testing"
          aria-haspopup=${several ? 'menu' : nothing}
          aria-expanded=${several ? String(this.menuOpen) : nothing}
          @click=${() => (several ? (this.menuOpen = !this.menuOpen) : this.fire('ct-action', 'study'))}
        >${listChecks}</button>
        ${this.menuOpen
          ? html`<div class="menu" role="menu" @keydown=${(e: KeyboardEvent) => {
              if (e.key !== 'Escape') return
              e.stopPropagation()
              this.menuOpen = false
            }}>
              <span class="menu-title">Switch to testing</span>
              ${this.studies.map((s) => html`<button role="menuitem" @click=${() => {
                this.menuOpen = false
                this.fire('ct-study', s.id)
              }}>${s.title}</button>`)}
            </div>`
          : html`<span class="tip" aria-hidden="true">Switch to testing</span>`}
      </div>`
  }

  private fire(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }))
  }

  render() {
    return html`
      ${this.button('comment', 'Comment', 'C', this.commenting, messageCircle)}
      ${this.button('visibility', this.visible ? 'Hide comments' : 'Show comments', 'Shift+C', !this.visible, this.visible ? eye : eyeOff)}
      ${this.button('list', this.listOpen ? 'Hide comments list' : 'Show comments list', null, this.listOpen, list)}
      ${this.studies.length ? this.studySwitch() : nothing}
    `
  }
}

define('ct-toolbar', CtToolbar)
