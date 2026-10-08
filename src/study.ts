import { LitElement, css, html, nothing, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { keyed } from 'lit/directives/keyed.js'
import { chevronDown, chevronUp, circleCheck } from './icons'
import { base, tokens } from './styles'
import type { Study } from './types'
import { define, navigateTo, studyProgressKey as progressKey } from './util'

/*
 * Study mode: takes a participant through a set of tasks, with the current
 * task's instructions in a bar at the top of the page while they work. It is
 * separate from review mode: no comments, pins or toolbar while a study runs.
 * Progress is kept for the tab, so a reload doesn't lose their place.
 */

export interface StudyConfig {
  id: string
  study: Study
  hookAttribute: string
  /** Ends the study: removes the bar and forgets progress. */
  onEnd: () => void
}

/**
 * welcome: the study's intro. brief: a task's instructions, before they start it.
 * doing: the task is under way. finished: the thank you.
 */
type Phase = 'welcome' | 'brief' | 'doing' | 'finished'

/** How long the "done" or "moving on" message shows before the next task. */
const FLASH_MS = 1400

/** True when the current address meets the goal: same path, and the goal's query and hash if it has them. */
function atUrl(goal: string): boolean {
  const want = new URL(goal, window.location.origin)
  const here = new URL(window.location.href)
  if (want.pathname !== here.pathname) return false
  for (const [key, value] of want.searchParams) if (here.searchParams.get(key) !== value) return false
  return !want.hash || want.hash === here.hash
}

export class CorktackStudy extends LitElement {
  private config!: StudyConfig

  @state() private phase: Phase = 'welcome'
  @state() private index = 0
  @state() private collapsed = false
  /** A short message between tasks. */
  @state() private flash = false
  /**
   * Just hidden with the pointer or focus still on the bar. Hover and focus
   * don't bring it back until the pointer moves onto the handle, or focus
   * comes back in. (Pointer leave can't be used: the bar slides away from
   * under a still pointer, and browsers don't report that as leaving.)
   */
  @state() private settling = false

  private teardown: Array<() => void> = []
  private flashTimer = 0

  static styles = [
    tokens,
    base,
    css`
      :host {
        all: initial;
        position: fixed;
        top: 0;
        left: 50%;
        z-index: 2147483000;
        transform: translateX(-50%);
        font: 13px/1.45 var(--font);
        color: var(--text);
        color-scheme: light;
        -webkit-font-smoothing: antialiased;
      }
      .bar {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 12px 16px;
        width: min(560px, calc(100vw - 24px));
        padding: 14px 16px;
        background: var(--surface);
        border-radius: 16px;
        box-shadow: var(--shadow);
        animation: drop var(--spring);
      }
      @keyframes drop { from { opacity: 0; transform: translateY(-12px); } }
      .text { flex: 1 1 260px; min-width: 0; }
      .step {
        display: inline-block;
        margin-bottom: 4px;
        padding: 1px 8px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        font-weight: 600;
      }
      h2 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.35; }
      p { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .muted { color: var(--text-secondary); }
      .actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
      .button {
        height: 34px;
        padding: 0 14px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--surface);
        font-weight: 600;
        white-space: nowrap;
        transition: transform var(--spring), background-color var(--ease);
      }
      .button:hover { background: var(--hover); transform: translateY(-1px); }
      .button:active { transform: scale(0.95); }
      .primary { border-color: var(--accent); background: var(--accent); color: #fff; }
      .primary:hover { background: #0B87E0; }
      .icon-button { flex: none; margin: -4px -6px 0 0; }
      .flash { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; }
      .flash .icon { width: 20px; height: 20px; color: var(--accent); }
      /* Hidden: the bar slides up off the screen, leaving only its handle peeking down from the top edge. */
      /*
       * The gap above the bar is padding inside the dock, so the hover area reaches the top
       * edge: a pointer resting where the handle was stays inside the bar once it comes down.
       */
      .dock {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-top: calc(12px + env(safe-area-inset-top, 0px));
        transition: transform 220ms ease-out;
      }
      /* Tucks away after a short grace period, so a slip of the pointer doesn't hide it. */
      .dock.hidden { transform: translateY(calc(-100% + 14px)); transition-delay: 300ms; }
      .dock.hidden.settling { transition-delay: 0s; }
      /* Resting on the handle, or tabbing into the bar, brings it down while you're there. */
      .dock.hidden:not(.settling):hover, .dock.hidden:not(.settling):focus-within { transform: none; transition-delay: 200ms; }
      /* Tucked away, the bar's shadow would show as a line along the top edge. */
      .dock.hidden.settling .bar, .dock.hidden:not(:hover):not(:focus-within) .bar { box-shadow: none; }
      .handle {
        display: grid;
        place-items: center;
        width: 52px;
        height: 14px;
        padding: 0;
        border: 0;
        border-radius: 0 0 10px 10px;
        background: var(--surface);
        box-shadow: 0 4px 10px rgb(0 0 0 / 0.1);
      }
      .handle::before { content: ""; width: 18px; height: 3px; border-radius: 2px; background: var(--accent); }
      .dock:not(.hidden) .handle { visibility: hidden; }
      .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
      @media (prefers-reduced-motion: reduce) {
        .button:hover, .button:active { transform: none; }
        .dock { transition: none; }
      }
    `,
  ]

  configure(config: StudyConfig): void {
    this.config = config
    try {
      const saved = JSON.parse(sessionStorage.getItem(progressKey(config.id)) ?? 'null') as { phase: Phase; index: number; collapsed?: boolean } | null
      if (saved && saved.index < config.study.tasks.length) {
        this.phase = saved.phase
        this.index = saved.index
        this.collapsed = !!saved.collapsed
      }
    } catch {
      // No saved progress: start at the welcome.
    }
  }

  connectedCallback(): void {
    super.connectedCallback()
    // Keep the bar's own focus and presses from reaching the prototype's drawers and outside-click handlers.
    for (const type of ['focusin', 'focusout', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend']) {
      this.on(this, type, (e) => e.stopPropagation())
    }
    // Goals: pressing a tagged element, or reaching an address.
    this.on(document, 'click', (e) => {
      const goal = this.task()?.goal?.press
      if (!goal || this.phase !== 'doing' || this.flash) return
      const hook = this.config.hookAttribute
      if (e.composedPath().some((n) => n instanceof Element && n.getAttribute(hook) === goal)) this.complete()
    }, true)
    const checkUrl = () => {
      const goal = this.task()?.goal?.url
      if (goal && this.phase === 'doing' && !this.flash && atUrl(goal)) this.complete()
    }
    this.on(window, 'corktack:navigate', checkUrl)
    this.on(window, 'popstate', checkUrl)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.teardown.forEach((fn) => fn())
    this.teardown = []
    clearTimeout(this.flashTimer)
  }

  private on(target: EventTarget, type: string, fn: (e: Event) => void, capture = false): void {
    target.addEventListener(type, fn, capture)
    this.teardown.push(() => target.removeEventListener(type, fn, capture))
  }

  private task() {
    return this.config.study.tasks[this.index]
  }

  private save(): void {
    try {
      sessionStorage.setItem(progressKey(this.config.id), JSON.stringify({ phase: this.phase, index: this.index, collapsed: this.collapsed }))
    } catch {
      // Progress lasts until a reload.
    }
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (['phase', 'index', 'collapsed'].some((key) => changed.has(key as keyof CorktackStudy))) this.save()
  }

  protected updated(changed: PropertyValues<this>): void {
    // Move focus to the next step's button, but never during a task, where focus belongs to the prototype.
    if ((changed.has('phase' as keyof CorktackStudy) || changed.has('flash' as keyof CorktackStudy)) && this.phase !== 'doing' && !this.flash) {
      this.renderRoot.querySelector<HTMLElement>('.primary')?.focus()
    }
  }

  /** Tucks the bar away now, even though the pointer and focus are still on it. */
  private hide(): void {
    this.settling = true
    this.collapsed = true
    ;((this.renderRoot as ShadowRoot).activeElement as HTMLElement | null)?.blur()
  }

  private startTask(): void {
    const start = this.task()?.start
    if (start) navigateTo(start)
    this.collapsed = false
    this.phase = 'doing'
  }

  /** Shows a short message, then moves to the next task or the thank you. */
  private complete(): void {
    this.collapsed = false
    this.flash = true
    clearTimeout(this.flashTimer)
    this.flashTimer = window.setTimeout(() => {
      this.flash = false
      if (this.index + 1 < this.config.study.tasks.length) {
        this.index++
        this.phase = 'brief'
      } else {
        this.phase = 'finished'
      }
    }, FLASH_MS)
  }

  private step() {
    return html`<span class="step">Task ${this.index + 1} of ${this.config.study.tasks.length}</span>`
  }

  private content() {
    const { study } = this.config
    const task = this.task()

    if (this.flash) {
      return html`<div class="bar" role="status">
        <div class="flash">${circleCheck}Task done</div>
      </div>`
    }

    if (this.phase === 'welcome') {
      return html`<div class="bar">
        <div class="text">
          <h2>${study.title}</h2>
          <p class="muted">${study.intro ?? `${study.tasks.length} short tasks. There are no wrong answers: we’re testing the design, not you.`}</p>
        </div>
        <div class="actions"><button class="button primary" @click=${() => (this.phase = 'brief')}>Start</button></div>
      </div>`
    }

    if (this.phase === 'finished') {
      return html`<div class="bar">
        <div class="text">
          <h2>That’s everything</h2>
          <p class="muted">Thanks for your time.</p>
        </div>
        <div class="actions"><button class="button primary" @click=${() => this.config.onEnd()}>Finish</button></div>
      </div>`
    }

    const doing = this.phase === 'doing'
    return html`<div class="bar">
      <div class="text">
        ${this.step()}
        <h2>${task.title}</h2>
        ${task.instructions ? html`<p>${task.instructions}</p>` : nothing}
      </div>
      <div class="actions">
        ${doing
          ? html`<button class="button primary" @click=${() => this.complete()}>Done</button>
              ${this.collapsed
                ? html`<button class="icon-button" aria-label="Keep task open" title="Keep task open" @click=${() => (this.collapsed = false)}>${chevronDown}</button>`
                : html`<button class="icon-button" aria-label="Hide task" title="Hide task" @click=${() => this.hide()}>${chevronUp}</button>`}`
          : html`<button class="button primary" @click=${() => this.startTask()}>Start task</button>`}
      </div>
    </div>`
  }

  render() {
    const announcement = this.flash
      ? ''
      : this.phase === 'brief' || this.phase === 'doing'
        ? `Task ${this.index + 1} of ${this.config.study.tasks.length}: ${this.task().title}`
        : ''
    return html`
      <section
        aria-label="Study"
        class="dock ${this.collapsed && this.phase === 'doing' && !this.flash ? 'hidden' : ''} ${this.settling ? 'settling' : ''}"
        @focusin=${() => (this.settling = false)}
      >
        ${keyed(`${this.phase}-${this.index}-${this.flash}`, this.content())}
        <button
          class="handle"
          aria-label="Show task"
          title="Show task"
          tabindex=${this.collapsed ? 0 : -1}
          @pointermove=${() => (this.settling = false)}
          @click=${() => (this.collapsed = false)}
        ></button>
      </section>
      <p class="sr-only" aria-live="polite">${announcement}</p>
    `
  }
}

const TAG = 'corktack-study'

export function mountStudy(config: StudyConfig): HTMLElement {
  define(TAG, CorktackStudy)
  document.querySelector(TAG)?.remove()
  const el = document.createElement(TAG) as CorktackStudy
  el.configure(config)
  document.body.append(el)
  return el
}
