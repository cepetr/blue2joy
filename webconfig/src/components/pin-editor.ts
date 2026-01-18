import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { btj } from '../models/btj-model.js';
import { Btj } from '../services/btj-messages.js';
import { HID_USAGE_TYPE } from '../utils/hid-usage.js';
import './hid-usage-select.js';

@customElement('pin-editor')
export class PinEditor extends LitElement {
  protected override createRenderRoot() {
    return this;
  }

  @property({ type: Number }) profileId!: number;
  @property({ type: Number }) pinId!: number;

  @state() private _local: Btj.PinConfig = Btj.PinConfig.default();

  override willUpdate(changed: any) {
    if (changed.has('profileId') || changed.has('pinId')) {
      if (this.profileId !== undefined && this.pinId !== undefined) {
        this._local = btj.profiles.get(this.profileId)?.pins.get(this.pinId) ?? Btj.PinConfig.default();
      }
    }
  }

  private emitEdit() {
    btj.setPinConfig(this.profileId, this.pinId, this._local);
  }

  private renderSource() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Source</label>
        <hid-usage-select
          .value=${cfg.source}
          .filter=${['digital', 'analog', 'hatswitch', 'digital-intg']}
          @change=${(e: CustomEvent) => {
        this._local = { ...this._local, source: e.detail.value };
        this.emitEdit();
      }}
        ></hid-usage-select>
      </div>
    `;
  }

  private renderInvert() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Mode</label>
        <select
          class="form-select"
          aria-label="Invert"
          @change=${(e: Event) => {
        const v = (e.target as HTMLSelectElement).value === 'inverted';
        this._local = { ...this._local, invert: v };
        this.emitEdit();
      }}
        >
          <option value="normal" ?selected=${!cfg.invert}>Normal</option>
          <option value="inverted" ?selected=${cfg.invert}>Inverted</option>
        </select>
      </div>
    `;
  }

  private renderHatSwitch() {
    const cfg = this._local;
    const knownHatValues = [0, 1, 2, 4, 8];
    const hatLabels: Record<number, string> = { 0: 'Not selected', 1: 'Up', 2: 'Down', 4: 'Left', 8: 'Right' };
    const isKnownHat = knownHatValues.includes(cfg.hatSwitch);
    return html`
      <div class="mb-2">
        <label class="form-label">Direction</label>
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
      }}
          @change=${() => {
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
      }}
          @change=${() => {
        this.emitEdit();
      }}
        />
      </div>
    `;
  }

  override render() {
    const usageType = HID_USAGE_TYPE[this._local.source];

    return html`
        <div class="card">
          <div class="row g-0 align-items-stretch">
            <div class="col-auto">
              <div class="h-100 bg-body-secondary border-end px-3 py-2 d-flex align-items-center">
                <h5 class="card-title mb-0">Pin ${this.pinId}</h5>
              </div>
            </div>
            <div class="col">
              <div class="card-body">
                <div class="row g-4">
                  <div class="col-6 col-xl-2">
                    ${this.renderSource()}
                  </div>
                  <div class="col-6 col-xl-2">
                    ${usageType != '' && usageType != 'digital-intg' ? this.renderInvert() : ''}
                  </div>

                  ${usageType === 'hatswitch' ? html`
                  <div class="col-6 col-xl-3">
                    ${this.renderHatSwitch()}
                  </div>
                  ` : ''}

                  ${usageType == 'analog' ? html`
                  <div class="col-6 col-xl-4">
                    ${this.renderThreshold()}
                  </div>
                  <div class="col-6 col-xl-4">
                    ${this.renderHysteresis()}
                  </div>
                  ` : ''}
                </div>
            </div>
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
