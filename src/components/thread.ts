import { LitElement, css, html, nothing } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { circleCheck, ellipsis, x } from '../icons'
import { base } from '../styles'
import type { FeedbackComment } from '../types'
import { avatarColour, define, initials, timeAgo } from '../util'
import type { CtComposer } from './composer'
import './composer'

/**
 * The thread card: the comment, its replies in order, and a reply field.
 * Fires `ct-close`, `ct-resolve` with `{ id, resolved }`, and `ct-delete`
 * with `{ id }` once a delete is confirmed. Anyone can resolve or delete.
 */
export class CtThread extends LitElement {
  @property({ attribute: false }) comment!: FeedbackComment
  @property({ attribute: false }) replies: FeedbackComment[] = []
  @property({ type: Number }) now = Date.now()
  /** Link that opens the prototype at this comment. */
  @property() link = ''
  @property({ attribute: false }) onReply?: (name: string, body: string) => Promise<void>

  /** Id of the comment whose menu is open. */
  @state() private menuFor: string | null = null
  /** Id of the comment whose delete is awaiting confirmation. */
  @state() private confirming: string | null = null
  /** Brief confirmation shown in place of the time after copying. */
  @state() private copyStatus = ''

  @query('ct-composer') private composer!: CtComposer

  private copiedTimer = 0

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
      .icon-button[aria-pressed="true"] { color: var(--accent); }
      /* Reply menus stay out of the way until the reply is hovered or focused. */
      @media (hover: hover) {
        .reply .more:not([aria-expanded="true"]) { opacity: 0; }
        .reply:hover .more, .reply:focus-within .more { opacity: 1; }
      }
      /* Fixed, so the scrolling list of entries doesn't clip it. Placed in openMenu(). */
      .menu {
        position: fixed;
        z-index: 1;
        display: grid;
        min-width: 160px;
        padding: 4px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        box-shadow: var(--shadow);
      }
      .menu button {
        height: 32px;
        padding: 0 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        text-align: left;
        white-space: nowrap;
      }
      .menu button:hover, .menu button:focus-visible { background: var(--hover); }
      .menu .danger-item { color: var(--danger); }
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

  disconnectedCallback(): void {
    super.disconnectedCallback()
    clearTimeout(this.copiedTimer)
  }

  private async openMenu(id: string): Promise<void> {
    this.menuFor = this.menuFor === id ? null : id
    await this.updateComplete
    const menu = this.renderRoot.querySelector<HTMLElement>('.menu')
    const button = this.renderRoot.querySelector<HTMLElement>(`[data-menu="${id}"]`)
    if (!menu || !button) return
    const r = button.getBoundingClientRect()
    menu.style.top = `${r.bottom + 4}px`
    menu.style.left = `${Math.max(8, r.right - menu.offsetWidth)}px`
    menu.querySelector<HTMLElement>('button')?.focus()
  }

  private closeMenu(refocus: boolean): void {
    const id = this.menuFor
    this.menuFor = null
    if (refocus && id) this.renderRoot.querySelector<HTMLElement>(`[data-menu="${id}"]`)?.focus()
  }

  private onMenuKey(e: KeyboardEvent): void {
    const items = [...this.renderRoot.querySelectorAll<HTMLElement>('.menu button')]
    const at = items.indexOf((this.renderRoot as ShadowRoot).activeElement as HTMLElement)
    if (e.key === 'Escape') this.closeMenu(true)
    else if (e.key === 'ArrowDown') items[(at + 1) % items.length]?.focus()
    else if (e.key === 'ArrowUp') items[(at - 1 + items.length) % items.length]?.focus()
    else return
    // Keep Esc from also closing the card.
    e.preventDefault()
    e.stopPropagation()
  }

  private async copyLink(): Promise<void> {
    this.closeMenu(true)
    let ok = true
    try {
      await navigator.clipboard.writeText(this.link)
    } catch {
      ok = this.copyFallback()
    }
    this.copyStatus = ok ? 'Link copied' : 'Couldn’t copy link'
    clearTimeout(this.copiedTimer)
    this.copiedTimer = window.setTimeout(() => (this.copyStatus = ''), 2000)
  }

  /** For pages where the async clipboard isn't allowed, such as some embedded browsers. */
  private copyFallback(): boolean {
    const field = document.createElement('textarea')
    field.value = this.link
    field.style.cssText = 'position: fixed; opacity: 0;'
    this.renderRoot.append(field)
    field.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      field.remove()
    }
  }

  private menu(c: FeedbackComment, isReply: boolean) {
    const deleteLabel = isReply ? 'Delete reply' : 'Delete comment'
    const open = this.menuFor === c.id
    return html`<span
      class="menu-wrap"
      @focusout=${(e: FocusEvent) => {
        if (open && !(e.currentTarget as Element).contains(e.relatedTarget as Node)) this.closeMenu(false)
      }}
    >
      <button
        class="icon-button more"
        data-menu=${c.id}
        aria-label="More options"
        title="More options"
        aria-haspopup="menu"
        aria-expanded=${String(open)}
        @click=${() => void this.openMenu(c.id)}
      >${ellipsis}</button>
      ${open
        ? html`<span class="menu" role="menu" @keydown=${this.onMenuKey}>
            ${isReply ? nothing : html`<button role="menuitem" @click=${this.copyLink}>Copy link</button>`}
            <button role="menuitem" class="danger-item" @click=${() => {
              this.closeMenu(false)
              this.confirming = c.id
            }}>${deleteLabel}</button>
          </span>`
        : nothing}
    </span>`
  }

  private entry(c: FeedbackComment, first: boolean) {
    const isReply = c.parentId !== null
    const label = isReply ? 'Delete reply' : 'Delete comment'
    const resolved = !!c.resolvedAt
    return html`
      <article class="entry ${isReply ? 'reply' : ''}">
        <span class="avatar" style="--c: ${avatarColour(c.author)}" aria-hidden="true">${initials(c.author)}</span>
        <div>
          <div class="meta">
            <span class="name">${c.author}</span>
            ${first && this.copyStatus
              ? html`<span class="time" role="status">${this.copyStatus}</span>`
              : html`<time class="time" datetime=${c.createdAt}>${timeAgo(c.createdAt, this.now)}</time>`}
            <span class="actions">
              ${first
                ? html`<button
                    class="icon-button"
                    aria-label=${resolved ? 'Reopen' : 'Resolve'}
                    title=${resolved ? 'Reopen' : 'Resolve'}
                    aria-pressed=${String(resolved)}
                    @click=${() => this.fire('ct-resolve', { id: c.id, resolved: !resolved })}
                  >${circleCheck}</button>`
                : nothing}
              ${this.menu(c, isReply)}
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
