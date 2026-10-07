import { LitElement, css, html, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { x } from '../icons'
import { base } from '../styles'
import type { FeedbackComment } from '../types'
import { avatarColour, define, initials, plural, timeAgo } from '../util'

/**
 * Comments on the current page, newest first.
 * Fires `ct-select` with `{ id }` and `ct-close`.
 */
export class CtSidebar extends LitElement {
  @property({ attribute: false }) placed: FeedbackComment[] = []
  @property({ attribute: false }) unplaced: FeedbackComment[] = []
  @property({ attribute: false }) replyCounts = new Map<string, number>()
  @property() activeId: string | null = null
  @property({ type: Number }) now = Date.now()

  static styles = [
    base,
    css`
      :host {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        width: min(320px, 100vw);
        background: var(--surface);
        border-left: 1px solid var(--border);
        box-shadow: var(--shadow);
        pointer-events: auto;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 12px 12px 16px;
        border-bottom: 1px solid var(--border);
      }
      h2 { margin: 0; font-size: 13px; font-weight: 600; }
      .scroll { flex: 1; overflow: auto; padding: 8px 8px calc(72px + env(safe-area-inset-bottom, 0px)); }
      h3 { margin: 16px 8px 4px; font-size: 12px; font-weight: 600; color: var(--text-secondary); }
      ul { list-style: none; margin: 0; padding: 0; }
      .item {
        display: grid;
        grid-template-columns: 24px 1fr;
        gap: 8px;
        width: 100%;
        padding: 12px 8px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        text-align: left;
      }
      .item:hover, .item[aria-current="true"] { background: var(--hover); }
      .meta { display: flex; align-items: baseline; gap: 6px; min-height: 24px; padding-top: 3px; }
      .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .time, .count { flex: none; font-size: 12px; color: var(--text-secondary); }
      .body {
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      .count { display: block; margin-top: 4px; }
      .empty { margin: 8px; color: var(--text-secondary); }
    `,
  ]

  private fire(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }))
  }

  private list(items: FeedbackComment[]) {
    return html`<ul>
      ${items.map((c) => {
        const count = this.replyCounts.get(c.id) ?? 0
        return html`<li>
          <button class="item" aria-current=${String(this.activeId === c.id)} @click=${() => this.fire('ct-select', { id: c.id })}>
            <span class="avatar" style="--c: ${avatarColour(c.author)}" aria-hidden="true">${initials(c.author)}</span>
            <span>
              <span class="meta">
                <span class="name">${c.author}</span>
                <time class="time" datetime=${c.createdAt}>${timeAgo(c.createdAt, this.now)}</time>
              </span>
              <span class="body">${c.body}</span>
              ${count ? html`<span class="count">${plural(count, 'reply', 'replies')}</span>` : nothing}
            </span>
          </button>
        </li>`
      })}
    </ul>`
  }

  render() {
    const empty = !this.placed.length && !this.unplaced.length
    return html`
      <header>
        <h2 id="title">Comments</h2>
        <button class="icon-button" aria-label="Close comments list" title="Close" @click=${() => this.fire('ct-close')}>${x}</button>
      </header>
      <section class="scroll" aria-labelledby="title">
        ${empty ? html`<p class="empty">No comments on this page yet. Press C to add one.</p>` : nothing}
        ${this.placed.length ? this.list(this.placed) : nothing}
        ${this.unplaced.length
          ? html`<h3>Couldn’t place on this page</h3>${this.list(this.unplaced)}`
          : nothing}
      </section>
    `
  }
}

define('ct-sidebar', CtSidebar)
