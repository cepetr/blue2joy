import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Btj } from './btj-messages.js';
import './hid-source.js';
import { picoSheet } from './styles/pico';

@customElement('pot-config-editor')
export class PotConfigEditor extends LitElement {
  static override styles = [picoSheet]

  @property({ type: Number }) profileId!: number;
  @property({ type: Number }) potId!: number;
  @property({ attribute: false }) config?: Btj.PotConfig;

  @state() private _local: Btj.PotConfig = { source: 0, low: 0, high: 0, int_speed: 0 };

  override willUpdate(changed: any) {
    if (this.config && changed.has('config')) {
      this._local = { ...this.config } as Btj.PotConfig;
    }
  }

  private emitEdit() {
    const detail = { type: 'pot', id: this.potId, config: { ...this._local } };
    this.dispatchEvent(new CustomEvent('edit', { detail, bubbles: true, composed: true }));
  }

  override render() {
    const cfg = this._local;
    return html`
      <article class="card">
        <header>
          <h4>Pot ${this.potId}</h4>
        </header>
        <div>
          <label>Source
            <hid-source .value=${cfg.source} @change=${(e: CustomEvent) => { this._local.source = e.detail.value; this.emitEdit(); }}></hid-source>
          </label>
        </div>
        <div>
          <label>Min
            <input .value=${String(cfg.low ?? '')} @input=${(e: Event) => { this._local.low = Number((e.target as HTMLInputElement).value); this.emitEdit(); }} />
          </label>
        </div>
        <div>
          <label>Max
            <input .value=${String(cfg.high ?? '')} @input=${(e: Event) => { this._local.high = Number((e.target as HTMLInputElement).value); this.emitEdit(); }} />
          </label>
        </div>
      </article>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pot-config-editor': PotConfigEditor;
  }
}
