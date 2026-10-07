import { LitElement, css, html, nothing } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { trash, x } from '../icons'
import { base } from '../styles'
import type { FeedbackComment } from '../types'
import { avatarColour, define, initials, timeAgo } from '../util'
import type { CtComposer } from './composer'
import './composer'

/**
 * The thread card: the comment, its replies in order, and a reply field.
 * Fires `ct-close`, and `ct-delete` with `{ id }` once a delete is confirmed.
 */
export class CtThread extends LitElement {
  @property({ attribute: false }) comment!: FeedbackComment
  @property({ attribute: false }) replies: FeedbackComment[] = []
  @property({ attribute: false }) ownIds = new Set<string>()
  @property({ type: Number }) now = Date.now()
  @property({ attribute: false }) onReply?: (name: string, body: string) => Promise<void>

  /** Id of the comment whose delete is awaiting confirmation. */
  @state() private confirming: string | null = null

  @query('ct-composer') private composer!: CtComposer

  static styles = [
    base,
    css`
      :host { display: block; }
      .entries {
        display: grid;
        gap: 16px;
        max-height: min(420px, 55vh);
        overflow: auto;
        margin: -4px -12px 0;
        padding: 4px 12px;
      }
      .entry { display: grid; grid-template-columns: 24px 1fr; gap: 8px; }
      .meta { display: flex; align-items: center; gap: 6px; min-height: 24px; }
      .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .time { flex: none; font-size: 12px; color: var(--text-secondary); }
      .actions { display: flex; margin-left: auto; margin-right: -4px; }
      .body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .confirm {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
        padding: 8px;
        border-radius: 8px;
        background: var(--hover);
        font-size: 12px;
      }
      .confirm span { flex: 1 1 100%; }
      .text-button {
        height: 28px;
        padding: 0 10px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
      }
      .text-button.danger { border-color: var(--danger); background: var(--danger); color: #fff; }
      ct-composer { margin-top: 12px; }
    `,
  ]

  focus(): void {
    this.composer?.focus()
  }

  private entry(c: FeedbackComment, first: boolean) {
    const isReply = c.parentId !== null
    const own = this.ownIds.has(c.id)
    const label = isReply ? 'Delete reply' : 'Delete comment'
    return html`
      <article class="entry">
        <span class="avatar" style="--c: ${avatarColour(c.author)}" aria-hidden="true">${initials(c.author)}</span>
        <div>
          <div class="meta">
            <span class="name">${c.author}</span>
            <time class="time" datetime=${c.createdAt}>${timeAgo(c.createdAt, this.now)}</time>
            <span class="actions">
              ${own
                ? html`<button class="icon-button" aria-label=${label} title=${label} @click=${() => (this.confirming = c.id)}>${trash}</button>`
                : nothing}
              ${first
                ? html`<button class="icon-button" aria-label="Close" title="Close" @click=${() => this.fire('ct-close')}>${x}</button>`
                : nothing}
            </span>
          </div>
          <p class="body">${c.body}</p>
          ${this.confirming === c.id
            ? html`<div class="confirm" role="group" aria-label=${label}>
                <span>${isReply ? 'Delete this reply?' : 'Delete this comment and its replies?'}</span>
                <button class="text-button" @click=${() => (this.confirming = null)}>Cancel</button>
                <button class="text-button danger" @click=${() => this.fire('ct-delete', { id: c.id })}>${label}</button>
              </div>`
            : nothing}
        </div>
      </article>
    `
  }

  private fire(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }))
  }

  render() {
    return html`
      <div class="entries">
        ${this.entry(this.comment, true)}
        ${this.replies.map((r) => this.entry(r, false))}
      </div>
      <ct-composer placeholder="Reply" label="Reply" .onSubmit=${this.onReply}></ct-composer>
    `
  }
}

define('ct-thread', CtThread)
