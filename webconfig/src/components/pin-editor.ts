import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Btj } from '../services/btj-messages.js';
import './hid-usage-select.js';

@customElement('pin-editor')
export class PinEditor extends LitElement {
  protected override createRenderRoot() {
    return this;
  }

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

  private renderSource() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Source</label>
        <hid-usage-select
          .value=${cfg.source}
          @change=${(e: CustomEvent) => {
        this._local.source = e.detail.value;
        this.emitEdit();
      }}
        ></hid-usage-select>
      </div>
    `;
  }

  private renderInvert() {
    const cfg = this._local;
    const id = `invert${this.pinId}`;
    return html`
      <div class="form-check mb-2">
        <input
          class="form-check-input"
          type="checkbox"
          id=${id}
          .checked=${cfg.invert}
          @change=${(e: Event) => {
        this._local.invert = (e.target as HTMLInputElement).checked;
        this.emitEdit();
      }}
        />
        <label class="form-check-label" for=${id}>Invert</label>
      </div>
    `;
  }

  private renderHatSwitch() {
    const cfg = this._local;
    const knownHatValues = [0, 1, 2, 4, 8];
    const hatLabels: Record<number, string> = { 0: 'Not used', 1: 'Up', 2: 'Down', 4: 'Left', 8: 'Right' };
    const isKnownHat = knownHatValues.includes(cfg.hatSwitch);
    return html`
      <div class="mb-2">
        <label class="form-label">Hat Switch</label>
        <select
          class="form-select"
          @change=${(e: Event) => {
        const v = Number((e.target as HTMLSelectElement).value);
        this._local = { ...this._local, hatSwitch: v };
        this.emitEdit();
      }}
        >
          ${!isKnownHat
        ? html`<option value=${String(cfg.hatSwitch)} selected>
                0x${cfg.hatSwitch.toString(16).toUpperCase().padStart(2, '0')}
              </option>`
        : ''}
          ${knownHatValues.map(v => html`
            <option value=${String(v)} ?selected=${v === cfg.hatSwitch}>
              ${hatLabels[v]}
            </option>
          `)}
        </select>
      </div>
    `;
  }

  private renderThreshold() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Threshold (${cfg.threshold}%)</label>
        <input
          type="range"
          class="form-range"
          min="0"
          max="100"
          step="1"
          .value=${String(cfg.threshold ?? 0)}
          @input=${(e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        this._local = { ...this._local, threshold: v };
        this.emitEdit();
      }}
        />
      </div>
    `;
  }

  private renderHysteresis() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Hysteresis (${cfg.hysteresis}%)</label>
        <input
          type="range"
          class="form-range"
          min="0"
          max="30"
          step="1"
          .value=${String(cfg.hysteresis ?? 0)}
          @input=${(e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        this._local = { ...this._local, hysteresis: v };
        this.emitEdit();
      }}
        />
      </div>
    `;
  }

  override render() {
    return html`
        <div class="card h-100">
          <div class="card-header py-2">
            <h5 class="card-title mb-0">Pin ${this.pinId}</h5>
          </div>
          <div class="card-body">
            ${this.renderSource()}
            ${this.renderInvert()}
            ${this.renderHatSwitch()}
            ${this.renderThreshold()}
            ${this.renderHysteresis()}
          </div>
        </div>
      `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pin-editor': PinEditor;
  }
}
