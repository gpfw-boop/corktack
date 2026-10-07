import { LitElement, css, html, nothing } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { arrowUp } from '../icons'
import { reviewerName } from '../identity'
import { base } from '../styles'
import { define } from '../util'

/**
 * A single growing text field with a round post button. Enter posts,
 * Shift+Enter adds a line. Asks for the reviewer's name the first time only.
 */
export class CtComposer extends LitElement {
  @property() placeholder = 'Add a comment'
  @property() label = 'Post'
  /** Called with the name and text. Reject to show an error and keep the text. */
  @property({ attribute: false }) onSubmit?: (name: string, body: string) => Promise<void>

  @state() private name = reviewerName.get()
  @state() private needsName = !reviewerName.get()
  @state() private text = ''
  @state() private busy = false
  @state() private error = ''

  @query('textarea') private textarea!: HTMLTextAreaElement
  @query('input') private nameInput?: HTMLInputElement

  static styles = [
    base,
    css`
      :host { display: block; }
      .name, .field {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
      }
      .name { height: 34px; margin-bottom: 8px; padding: 0 10px; }
      /* The field's border turns blue on focus, so the inputs skip the outer ring. */
      .name:focus, textarea:focus-visible { outline: none; }
      .name:focus { border-color: var(--accent); }
      .field { display: flex; align-items: flex-end; gap: 8px; padding: 2px 2px 2px 10px; }
      .field:focus-within { border-color: var(--accent); }
      textarea {
        flex: 1;
        min-width: 0;
        height: 28px;
        max-height: 160px;
        padding: 5px 0;
        overflow-y: hidden;
        border: 0;
        outline: none;
        resize: none;
        background: transparent;
        line-height: 1.45;
      }
      ::placeholder { color: var(--text-secondary); opacity: 1; }
      .post {
        display: grid;
        place-items: center;
        flex: none;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: var(--accent);
        color: #fff;
        transition: background-color var(--ease);
      }
      .post:disabled { background: var(--hover); color: var(--text-secondary); cursor: default; }
      .error { margin: 6px 0 0; font-size: 12px; color: var(--danger); }
    `,
  ]

  focus(): void {
    ;(this.needsName ? this.nameInput : this.textarea)?.focus()
  }

  private get ready(): boolean {
    return !this.busy && !!this.text.trim() && !!this.name.trim()
  }

  private grow(): void {
    const el = this.textarea
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    // Only scroll once the text outgrows the field, or a one-line field shows a scrollbar.
    el.style.overflowY = el.scrollHeight > 160 ? 'auto' : 'hidden'
  }

  private async submit(): Promise<void> {
    if (!this.ready || !this.onSubmit) {
      if (!this.name.trim()) this.nameInput?.focus()
      return
    }
    this.busy = true
    this.error = ''
    try {
      await this.onSubmit(this.name.trim(), this.text.trim())
      this.text = ''
      this.needsName = false
      await this.updateComplete
      this.grow()
    } catch {
      this.error = 'Couldn’t post. Check your connection and try again.'
    } finally {
      this.busy = false
    }
  }

  // Autofill is off, with each password manager's opt-out attribute, so the
  // name field doesn't pop up saved identities (1Password, LastPass, Bitwarden, Dashlane).
  render() {
    return html`
      ${this.needsName
        ? html`<input
            class="name"
            type="text"
            placeholder="Your name"
            aria-label="Your name"
            autocomplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            data-form-type="other"
            maxlength="60"
            .value=${this.name}
            @input=${(e: InputEvent) => (this.name = (e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                this.textarea.focus()
              }
            }}
          />`
        : nothing}
      <div class="field">
        <textarea
          rows="1"
          maxlength="2000"
          autocomplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
          placeholder=${this.placeholder}
          aria-label=${this.placeholder}
          .value=${this.text}
          @input=${(e: InputEvent) => {
            this.text = (e.target as HTMLTextAreaElement).value
            this.grow()
          }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
              e.preventDefault()
              void this.submit()
            }
          }}
        ></textarea>
        <button class="post" aria-label=${this.label} ?disabled=${!this.ready} @click=${this.submit}>${arrowUp}</button>
      </div>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
    `
  }
}

define('ct-composer', CtComposer)
