import { LitElement, css, html, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { x } from '../icons'
import { base } from '../styles'
import type { FeedbackComment } from '../types'
import { avatarColour, define, initials, plural, timeAgo } from '../util'

export interface SidebarSection {
  /** Null for the comments placed on this page, which come first with no heading. */
  title: string | null
  items: FeedbackComment[]
}

/**
 * Comments on this page, then comments on other pages, each newest first.
 * Fires `ct-select` with `{ id }`, `ct-toggle-resolved` and `ct-close`.
 */
export class CtSidebar extends LitElement {
  @property({ attribute: false }) sections: SidebarSection[] = []
  /** True when there are no comments on this page, but there may be some elsewhere. */
  @property({ type: Boolean }) pageEmpty = false
  @property({ type: Number }) resolvedCount = 0
  @property({ type: Boolean }) showResolved = false
  @property({ attribute: false }) replyCounts = new Map<string, number>()
  @property() activeId: string | null = null
  @property({ type: Number }) now = Date.now()

  static styles = [
    base,
    css`
      /* Floats clear of the edges, like a card, rather than docking to the side. */
      :host {
        position: fixed;
        top: 12px;
        right: 12px;
        bottom: 12px;
        display: flex;
        flex-direction: column;
        width: min(320px, calc(100vw - 24px));
        overflow: hidden;
        background: var(--surface);
        border-radius: 16px;
        box-shadow: var(--shadow);
        pointer-events: auto;
        animation: slide-in var(--spring);
      }
      @keyframes slide-in { from { opacity: 0; transform: translateX(24px); } }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 12px 12px 16px;
        border-bottom: 1px solid var(--border);
      }
      h2 { margin: 0; font-size: 13px; font-weight: 600; }
      .header-actions { display: flex; align-items: center; gap: 4px; }
      .toggle {
        height: 28px;
        padding: 0 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--text-secondary);
        font-size: 12px;
      }
      .toggle:hover { background: var(--hover); color: var(--text); }
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
      .item.resolved .avatar, .item.resolved .body { opacity: 0.55; }
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
          <button
            class="item ${c.resolvedAt ? 'resolved' : ''}"
            aria-current=${String(this.activeId === c.id)}
            @click=${() => this.fire('ct-select', { id: c.id })}
          >
            <span class="avatar" style="--c: ${avatarColour(c.author)}" aria-hidden="true">${initials(c.author)}</span>
            <span>
              <span class="meta">
                <span class="name">${c.author}</span>
                <time class="time" datetime=${c.createdAt}>${timeAgo(c.createdAt, this.now)}</time>
                ${c.resolvedAt ? html`<span class="time">Resolved</span>` : nothing}
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
    const empty = this.sections.every((s) => !s.items.length)
    return html`
      <header>
        <h2 id="title">Comments</h2>
        <span class="header-actions">
          ${this.resolvedCount
            ? html`<button class="toggle" aria-pressed=${String(this.showResolved)} @click=${() => this.fire('ct-toggle-resolved')}>
                ${this.showResolved ? 'Hide resolved' : `Show resolved (${this.resolvedCount})`}
              </button>`
            : nothing}
          <button class="icon-button" aria-label="Close comments list" title="Close" @click=${() => this.fire('ct-close')}>${x}</button>
        </span>
      </header>
      <section class="scroll" aria-labelledby="title">
        ${empty
          ? html`<p class="empty">No comments yet. Press C to add one.</p>`
          : this.pageEmpty
            ? html`<p class="empty">No comments on this page yet.</p>`
            : nothing}
        ${this.sections.map((s) =>
          s.items.length
            ? html`${s.title ? html`<h3>${s.title}</h3>` : nothing}${this.list(s.items)}`
            : nothing,
        )}
      </section>
    `
  }
}

define('ct-sidebar', CtSidebar)
