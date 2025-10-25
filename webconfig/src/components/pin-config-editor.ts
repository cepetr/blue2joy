import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Btj } from '../services/btj-messages.js';
import { picoSheet } from '../styles/pico.js';
import './hid-source.js';

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
    const knownHatValues = [0, 1, 2, 4, 8];
    const hatLabels: Record<number, string> = { 0: 'Not used', 1: 'Up', 2: 'Down', 4: 'Left', 8: 'Right' };
    const isKnownHat = knownHatValues.includes(cfg.hatSwitch);

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
          <div>
            <label>Hat Switch
              <select
                @change=${(e: Event) => {
        const v = Number((e.target as HTMLSelectElement).value);
        this._local = { ...this._local, hatSwitch: v };
        this.emitEdit();
      }}
              >
                ${!isKnownHat ? html`
                  <option value=${String(cfg.hatSwitch)} selected>
                    0x${cfg.hatSwitch.toString(16).toUpperCase().padStart(2, '0')}
                  </option>
                ` : ''}
                ${knownHatValues.map(v => html`
                  <option value=${String(v)} ?selected=${v === cfg.hatSwitch}>
                    ${hatLabels[v]}
                  </option>
                `)}
              </select>
            </label>
          </div>
          <div>
            <label>Threshold (${cfg.threshold}%)
              <input type="range" min="0" max="100" step="1"
                     .value=${String(cfg.threshold ?? 0)}
                     @input=${(e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        this._local = { ...this._local, threshold: v };
        this.emitEdit();
      }} />
            </label>
          </div>
          <div>
            <label>Hysteresis (${cfg.hysteresis}%)
              <input type="range" min="0" max="30" step="1"
                     .value=${String(cfg.hysteresis ?? 0)}
                     @input=${(e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        this._local = { ...this._local, hysteresis: v };
        this.emitEdit();
      }} />
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
