import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Btj } from './btj-messages.js';
import './hid-source.js';
import { picoSheet } from './styles/pico';

@customElement('pin-config-editor')
export class PinConfigEditor extends LitElement {
  static override styles = [picoSheet]

  @property({ type: Number }) profileId!: number;
  @property({ type: Number }) pinId!: number;
  @property({ attribute: false }) config?: Btj.PinConfig;

  @state() private _local: Btj.PinConfig = { source: 0, invert: false, hatSwitch: 0, threshold: 0, hysteresis: 0 };

  override willUpdate(changed: any) {
    if (this.config && changed.has('config')) {
      this._local = { ...this.config };
    }
  }

  private emitEdit() {
    const detail = { type: 'pin', id: this.pinId, config: { ...this._local } };
    this.dispatchEvent(new CustomEvent('edit', { detail, bubbles: true, composed: true }));
  }

  override render() {
    const cfg = this._local;
    return html`
        <article class="card">
          <header>
            <h4>Pin ${this.pinId}</h4>
          </header>
          <div>
            <label>Source
              <hid-source .value=${cfg.source} @change=${(e: CustomEvent) => { this._local.source = e.detail.value; this.emitEdit(); }}></hid-source>
            </label>
          </div>
          <div>
            <label>Invert
              <input type="checkbox" .checked=${cfg.invert} @change=${(e: Event) => { this._local.invert = (e.target as HTMLInputElement).checked; this.emitEdit(); }} />
            </label>
          </div>
        </article>
      `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pin-config-editor': PinConfigEditor;
  }
}
