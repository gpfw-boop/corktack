import { LitElement, css, html, nothing, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import { createAnchor, findElement, pointFor } from './anchor'
import { reviewerName } from './identity'
import { base, pageCss, tokens } from './styles'
import type { Anchor, CommentView, FeedbackComment, StorageAdapter } from './types'
import { avatarColour, define, navigateTo } from './util'
import { COMMENT_PARAM, ViewRecorder, currentViewUrl, isShown, replaySteps, waitFor } from './view'
import type { CtComposer } from './components/composer'
import type { SidebarSection } from './components/sidebar'
import type { CtThread } from './components/thread'
import type { ToolbarAction } from './components/toolbar'
import './components/composer'
import './components/pin'
import './components/sidebar'
import './components/thread'
import './components/toolbar'

export interface OverlayConfig {
  project: string
  /** The query parameter that turns feedback on, used in comment links. */
  param: string
  adapter: StorageAdapter
  hookAttribute: string
  getRoute: () => string
  /** Turns comments off: removes the overlay and brings the tab back. */
  onClose: () => void
}

type Point = { x: number; y: number }
type TopLevel = FeedbackComment & { anchor: Anchor }

type Card =
  | { kind: 'none' }
  | { kind: 'compose'; el: Element; anchor: Anchor; view: CommentView }
  | { kind: 'thread'; id: string }

/** The comments list's width plus the gap it floats in. */
const SIDEBAR_WIDTH = 332
const NARROW = 640
/** How long to wait for another page to render before opening a comment on it. */
const PAGE_WAIT_MS = 3000

const isTopLevel = (c: FeedbackComment): c is TopLevel => c.parentId === null && c.anchor !== null

const isEditable = (target: EventTarget | undefined): boolean => {
  const el = target as HTMLElement | undefined
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

const scrollBehaviour = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

/**
 * Root of the widget: a full-screen transparent layer over the page. Owns the
 * data, the page listeners and positioning; the child components only render.
 */
export class CorktackOverlay extends LitElement {
  private config!: OverlayConfig

  @state() private comments: FeedbackComment[] = []
  @state() private commenting = false
  @state() private visible = true
  @state() private listOpen = false
  @state() private showResolved = false
  @state() private card: Card = { kind: 'none' }
  @state() private now = Date.now()

  /** Pin points for the current route, measured each frame something moves. Null when the element can't be found or is hidden. */
  private positions = new Map<string, Point | null>()
  private draftPoint: Point | null = null
  private elementCache = new Map<string, Element>()
  private frame = 0
  private mutationTimer = 0
  private teardown: Array<() => void> = []
  private lastRoute = ''
  private recorder!: ViewRecorder
  /** True while reopening a comment's view, so its presses reach the page. */
  private replaying = false
  /** Increases with each comment opened, so a slow open gives way to a newer one. */
  private opening = 0

  static styles = [
    tokens,
    base,
    css`
      :host {
        all: initial;
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        pointer-events: none;
        font: 13px/1.45 var(--font);
        color: var(--text);
        color-scheme: light;
        -webkit-font-smoothing: antialiased;
      }
      .layer { position: fixed; inset: 0; overflow: hidden; }
      .card {
        position: fixed;
        width: min(300px, calc(100vw - 24px));
        padding: 12px;
        background: var(--surface);
        border-radius: 12px;
        box-shadow: var(--shadow);
        pointer-events: auto;
        animation: open var(--spring);
      }
      @keyframes open { from { opacity: 0; transform: scale(0.94); } }
    `,
  ]

  configure(config: OverlayConfig): void {
    this.config = config
  }

  connectedCallback(): void {
    super.connectedCallback()
    const pageStyle = document.createElement('style')
    pageStyle.textContent = pageCss
    document.head.append(pageStyle)
    this.teardown.push(() => pageStyle.remove())

    this.listen()

    this.recorder = new ViewRecorder(this.config.hookAttribute, this.config.param, (e) => this.commenting || this.replaying || this.inside(e))
    this.teardown.push(this.recorder.start())

    // Keep the widget's own focus and presses from reaching the page. Drawers and dialogs often
    // trap focus or close on an outside press by listening on the document, and the widget sits
    // outside them, so typing in a comment would otherwise pull focus back or close the drawer.
    for (const type of ['focusin', 'focusout', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend']) {
      this.on(this, type, (e) => e.stopPropagation())
    }

    const unsubscribe = this.config.adapter.subscribe?.(this.config.project, () => void this.reload())
    if (unsubscribe) this.teardown.push(unsubscribe)

    // Keep "5 minutes ago" honest without re-rendering more than once a minute.
    const tick = window.setInterval(() => (this.now = Date.now()), 60_000)
    this.teardown.push(() => clearInterval(tick))

    // A tab left in the background can miss live updates, so catch up when it's shown again.
    this.on(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.reload()
    })

    this.lastRoute = this.config.getRoute()
    // A comment link: open that comment once comments have loaded and its page has rendered.
    const linked = new URLSearchParams(window.location.search).get(COMMENT_PARAM)
    void this.reload().then(() => {
      if (linked) void this.open(linked, true)
    })
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.teardown.forEach((fn) => fn())
    this.teardown = []
    document.documentElement.removeAttribute('data-corktack-commenting')
    cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  // ---------------------------------------------------------------- page listeners

  private on<T extends Event>(target: EventTarget, type: string, fn: (e: T) => void, options: AddEventListenerOptions = {}) {
    target.addEventListener(type, fn as EventListener, options)
    this.teardown.push(() => target.removeEventListener(type, fn as EventListener, options))
  }

  private inside(e: Event): boolean {
    return e.composedPath().includes(this)
  }

  private listen(): void {
    // While commenting, stop the prototype reacting to presses (links, Vue @click handlers).
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart']) {
      this.on(document, type, (e) => {
        if (this.inside(e) || this.replaying) return
        if (!this.commenting) {
          if (type === 'pointerdown' && this.card.kind === 'thread') this.card = { kind: 'none' }
          return
        }
        // Cancelling touchstart would also cancel the tap's click, which is what drops the pin.
        if (e.cancelable && type !== 'touchstart') e.preventDefault()
        e.stopImmediatePropagation()
      }, { capture: true, passive: false })
    }

    this.on<MouseEvent>(document, 'click', (e) => {
      if (!this.commenting || this.inside(e) || this.replaying) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.target instanceof Element) this.startCompose(e.target, e.clientX, e.clientY)
    }, { capture: true })

    this.on<KeyboardEvent>(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.card.kind !== 'none') this.card = { kind: 'none' }
        else if (this.commenting) this.setCommenting(false)
        else if (this.listOpen) this.listOpen = false
        return
      }
      if (isEditable(e.composedPath()[0]) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() !== 'c') return
      e.preventDefault()
      if (e.shiftKey) this.setVisible(!this.visible)
      else this.setCommenting(!this.commenting)
    })

    const schedule = () => this.schedule()
    this.on(window, 'scroll', schedule, { capture: true, passive: true })
    this.on(window, 'resize', schedule)
    // Drawers and menus slide in without changing the page structure, so measure again once they settle.
    this.on(document, 'transitionend', schedule, { capture: true })
    this.on(document, 'animationend', schedule, { capture: true })
    this.on(window, 'corktack:navigate', () => {
      // Routers also call replaceState without changing page; keep the card open then.
      const route = this.config.getRoute()
      if (route === this.lastRoute) return
      this.lastRoute = route
      this.elementCache.clear()
      this.card = { kind: 'none' }
      this.schedule()
    })

    const observer = new MutationObserver(() => {
      clearTimeout(this.mutationTimer)
      this.mutationTimer = window.setTimeout(() => {
        for (const [id, el] of this.elementCache) if (!el.isConnected) this.elementCache.delete(id)
        this.schedule()
      }, 80)
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    this.teardown.push(() => observer.disconnect())
  }

  // ---------------------------------------------------------------- data

  private async reload(): Promise<void> {
    try {
      this.comments = await this.config.adapter.list(this.config.project)
    } catch (e) {
      console.warn('[corktack] Could not load comments', e)
    }
  }

  /** Top-level comments, newest first. */
  private threads(): TopLevel[] {
    return this.comments.filter(isTopLevel).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /** Replies to a comment, oldest first. */
  private replies(id: string): FeedbackComment[] {
    return this.comments.filter((c) => c.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  private resolve(comment: TopLevel): Element | null {
    const cached = this.elementCache.get(comment.id)
    if (cached?.isConnected) return cached
    const el = findElement(comment.anchor)
    if (el) this.elementCache.set(comment.id, el)
    return el
  }

  private async post(name: string, body: string, parentId: string | null): Promise<void> {
    const compose = this.card.kind === 'compose' ? this.card : null
    if (!parentId && !compose) return
    reviewerName.set(name)
    const created = await this.config.adapter.create({
      project: this.config.project,
      parentId,
      route: this.config.getRoute(),
      author: name,
      body,
      anchor: parentId ? null : compose!.anchor,
      viewportWidth: parentId ? null : window.innerWidth,
      view: parentId ? null : compose!.view,
    })
    // Realtime may already have delivered it.
    if (!this.comments.some((c) => c.id === created.id)) this.comments = [...this.comments, created]
    if (compose) {
      this.elementCache.set(created.id, compose.el)
      this.card = { kind: 'none' }
    }
  }

  private async deleteComment(id: string): Promise<void> {
    try {
      await this.config.adapter.remove(id)
    } catch (e) {
      console.warn('[corktack] Could not delete comment', e)
    }
    if (this.card.kind === 'thread' && this.card.id === id) this.card = { kind: 'none' }
    await this.reload()
  }

  private async setResolved(id: string, resolved: boolean): Promise<void> {
    // Resolving closes the thread, as it's done with. Reopening keeps it open.
    if (resolved && !this.showResolved) this.card = { kind: 'none' }
    const resolvedAt = resolved ? new Date().toISOString() : null
    this.comments = this.comments.map((c) => (c.id === id ? { ...c, resolvedAt } : c))
    try {
      await this.config.adapter.setResolved(id, resolved)
    } catch (e) {
      console.warn('[corktack] Could not resolve comment', e)
    }
    await this.reload()
  }

  /** A link that opens the prototype at this comment, in the view it was left in. */
  private commentLink(c: FeedbackComment): string {
    const url = new URL(c.view?.url ?? c.route, window.location.origin)
    url.searchParams.set(this.config.param, '1')
    url.searchParams.set(COMMENT_PARAM, c.id)
    return url.href
  }

  // ---------------------------------------------------------------- state changes

  private setCommenting(on: boolean): void {
    this.commenting = on
    document.documentElement.toggleAttribute('data-corktack-commenting', on)
    if (on) this.visible = true
    else if (this.card.kind === 'compose') this.card = { kind: 'none' }
  }

  private setVisible(on: boolean): void {
    this.visible = on
    if (!on) {
      this.setCommenting(false)
      this.card = { kind: 'none' }
    }
  }

  private onToolbar(action: ToolbarAction): void {
    if (action === 'comment') this.setCommenting(!this.commenting)
    if (action === 'visibility') this.setVisible(!this.visible)
    if (action === 'list') this.listOpen = !this.listOpen
    if (action === 'close') this.config.onClose()
  }

  private startCompose(el: Element, x: number, y: number): void {
    this.card = { kind: 'compose', el, anchor: createAnchor(el, x, y, this.config.hookAttribute), view: this.recorder.viewFor(el) }
  }

  private toggleThread(id: string): void {
    this.card = this.card.kind === 'thread' && this.card.id === id ? { kind: 'none' } : { kind: 'thread', id }
  }

  /**
   * Opens a comment in the view it was left in: goes to its address, replays
   * the presses that revealed it (opening a drawer, say), then opens the card
   * at the pin, or centred if it still can't be placed. `fromLink` means the
   * page was loaded from a comment link, so the address is already right.
   */
  private async open(id: string, fromLink = false): Promise<void> {
    const c = this.threads().find((t) => t.id === id)
    if (!c) return
    const token = ++this.opening
    if (window.innerWidth < NARROW) this.listOpen = false

    const there = c.view ? currentViewUrl(this.config.param) === c.view.url : this.config.getRoute() === c.route
    const navigated = !fromLink && !there
    if (navigated) navigateTo(c.view?.url ?? c.route)
    const wait = navigated || fromLink ? PAGE_WAIT_MS : 300

    this.replaying = true
    try {
      if (c.view?.steps.length) await replaySteps(c.view.steps, c.anchor, wait)
      await waitFor(() => isShown(c.anchor), wait)
    } finally {
      this.replaying = false
    }
    if (token !== this.opening) return

    // The router changed the address but not the page: load the link instead.
    if (navigated && this.config.getRoute() === c.route && !findElement(c.anchor)) {
      window.location.assign(this.commentLink(c))
      return
    }
    this.measure()
    if (c.resolvedAt) this.showResolved = true
    const el = this.positions.get(id) ? this.resolve(c) : null
    el?.scrollIntoView({ block: 'center', behavior: scrollBehaviour() })
    this.visible = true
    this.card = { kind: 'thread', id }
  }

  // ---------------------------------------------------------------- measuring

  private schedule(): void {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.measure())
  }

  private measure(): void {
    this.frame = 0
    const route = this.config.getRoute()
    const next = new Map<string, Point | null>()
    for (const c of this.threads()) {
      if (c.route !== route) continue
      const el = this.resolve(c)
      next.set(c.id, el && pointFor(el, c.anchor))
    }
    this.positions = next
    this.draftPoint = this.card.kind === 'compose' ? pointFor(this.card.el, this.card.anchor) : null
    this.requestUpdate()
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('comments' as keyof CorktackOverlay) || changed.has('card' as keyof CorktackOverlay)) this.schedule()
  }

  protected updated(changed: PropertyValues<this>): void {
    this.positionCard()
    // Focus the field, except for threads on touch screens, where it would pop up the keyboard.
    const focusable = this.card.kind === 'compose' || (this.card.kind === 'thread' && window.matchMedia('(hover: hover)').matches)
    if (changed.has('card' as keyof CorktackOverlay) && focusable) {
      const target = this.renderRoot.querySelector<CtComposer | CtThread>('.card > *')
      void target?.updateComplete.then(() => target.focus())
    }
  }

  /** Where the open card should point, or null to centre it. */
  private cardTarget(): Point | null {
    if (this.card.kind === 'compose') return this.draftPoint
    if (this.card.kind === 'thread') return this.positions.get(this.card.id) ?? null
    return null
  }

  /** Beside the pin when there's room, otherwise below or above it. Keeps clear of the sidebar. */
  private positionCard(): void {
    const card = this.renderRoot.querySelector<HTMLElement>('.card')
    if (!card) return
    const target = this.cardTarget()
    const w = card.offsetWidth
    const ht = card.offsetHeight
    const vw = this.listOpen && window.innerWidth >= NARROW ? window.innerWidth - SIDEBAR_WIDTH : window.innerWidth
    const vh = window.innerHeight
    const margin = 12
    if (!target) {
      // Comments that couldn't be placed open in the middle of the visible area.
      card.style.left = `${Math.max(margin, (vw - w) / 2)}px`
      card.style.top = `${Math.max(margin, (vh - ht) / 2)}px`
      return
    }
    const clampY = (y: number) => Math.min(Math.max(margin, y), vh - ht - margin)
    let left: number
    let top: number
    // Pins are 28px and extend up and right from the point.
    if (target.x + 40 + w <= vw - margin) {
      left = target.x + 40
      top = clampY(target.y - 28)
    } else if (target.x - 12 - w >= margin) {
      left = target.x - 12 - w
      top = clampY(target.y - 28)
    } else {
      left = Math.min(Math.max(margin, target.x - w / 2), vw - w - margin)
      top = target.y + 12 + ht <= vh - margin ? target.y + 12 : Math.max(margin, target.y - 40 - ht)
    }
    card.style.left = `${left}px`
    card.style.top = `${top}px`
  }

  // ---------------------------------------------------------------- rendering

  private renderPins(threads: TopLevel[]) {
    const activeId = this.card.kind === 'thread' ? this.card.id : null
    const placed = threads.filter((c) => this.positions.get(c.id) && (this.showResolved || !c.resolvedAt))
    return html`
      ${repeat(placed, (c) => c.id, (c) => {
        const p = this.positions.get(c.id)!
        return html`<ct-pin
          style=${styleMap({ left: `${p.x}px`, top: `${p.y}px`, '--c': avatarColour(c.author), '--room': `${window.innerWidth - p.x - 8}px` })}
          .author=${c.author}
          .body=${c.body}
          .replies=${this.replies(c.id).length}
          ?active=${activeId === c.id}
          ?resolved=${!!c.resolvedAt}
          @click=${() => this.toggleThread(c.id)}
        ></ct-pin>`
      })}
      ${this.card.kind === 'compose' && this.draftPoint
        ? html`<ct-pin
            draft
            .author=${reviewerName.get()}
            style=${styleMap({ left: `${this.draftPoint.x}px`, top: `${this.draftPoint.y}px`, '--c': reviewerName.get() ? avatarColour(reviewerName.get()) : 'var(--accent)' })}
          ></ct-pin>`
        : nothing}
    `
  }

  private renderCard() {
    const card = this.card
    if (card.kind === 'compose') {
      return html`<div class="card" role="dialog" aria-label="New comment">
        <ct-composer .onSubmit=${(name: string, body: string) => this.post(name, body, null)}></ct-composer>
      </div>`
    }
    if (card.kind === 'thread') {
      const c = this.threads().find((t) => t.id === card.id)
      if (!c) return nothing
      return html`<div class="card" role="dialog" aria-label=${`Comment from ${c.author}`}>
        <ct-thread
          .comment=${c}
          .replies=${this.replies(c.id)}
          .now=${this.now}
          .link=${this.commentLink(c)}
          .onReply=${(name: string, body: string) => this.post(name, body, c.id)}
          @ct-close=${() => (this.card = { kind: 'none' })}
          @ct-delete=${(e: CustomEvent<{ id: string }>) => void this.deleteComment(e.detail.id)}
          @ct-resolve=${(e: CustomEvent<{ id: string; resolved: boolean }>) => void this.setResolved(e.detail.id, e.detail.resolved)}
        ></ct-thread>
      </div>`
    }
    return nothing
  }

  /** This page's comments, those that couldn't be placed, then other pages by their latest comment. */
  private sections(route: string): SidebarSection[] {
    const all = this.threads().filter((c) => this.showResolved || !c.resolvedAt)
    const here = all.filter((c) => c.route === route)
    const elsewhere = new Map<string, TopLevel[]>()
    for (const c of all) if (c.route !== route) elsewhere.set(c.route, [...(elsewhere.get(c.route) ?? []), c])
    return [
      { title: null, items: here.filter((c) => this.positions.get(c.id)) },
      { title: 'Not visible right now', items: here.filter((c) => this.positions.has(c.id) && !this.positions.get(c.id)) },
      // Threads are newest first, so each page's first item is its latest comment.
      ...[...elsewhere].map(([page, items]) => ({ title: page === '/' || page.endsWith('#/') ? 'Home' : page, items })),
    ]
  }

  render() {
    const route = this.config.getRoute()
    const threads = this.threads().filter((c) => c.route === route)
    const replyCounts = new Map(this.threads().map((c) => [c.id, this.replies(c.id).length]))

    return html`
      <div class="layer">${this.visible ? this.renderPins(threads) : nothing}</div>
      ${this.listOpen
        ? html`<ct-sidebar
            .sections=${this.sections(route)}
            ?pageEmpty=${!threads.some((c) => this.showResolved || !c.resolvedAt)}
            .resolvedCount=${this.threads().filter((c) => c.resolvedAt).length}
            ?showResolved=${this.showResolved}
            .replyCounts=${replyCounts}
            .activeId=${this.card.kind === 'thread' ? this.card.id : null}
            .now=${this.now}
            @ct-select=${(e: CustomEvent<{ id: string }>) => void this.open(e.detail.id)}
            @ct-close=${() => (this.listOpen = false)}
            @ct-toggle-resolved=${() => (this.showResolved = !this.showResolved)}
          ></ct-sidebar>`
        : nothing}
      ${this.visible ? this.renderCard() : nothing}
      <ct-toolbar
        .commenting=${this.commenting}
        .visible=${this.visible}
        .listOpen=${this.listOpen}
        @ct-action=${(e: CustomEvent<ToolbarAction>) => this.onToolbar(e.detail)}
      ></ct-toolbar>
    `
  }
}

const TAG = 'corktack-overlay'

export function mountOverlay(config: OverlayConfig): HTMLElement {
  define(TAG, CorktackOverlay)
  document.querySelector(TAG)?.remove()
  const overlay = document.createElement(TAG) as CorktackOverlay
  overlay.configure(config)
  document.body.append(overlay)
  return overlay
}
