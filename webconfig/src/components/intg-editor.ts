import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { btj } from '../models/btj-model.js';
import { Btj } from '../services/btj-messages.js';
import { HID_USAGE_TYPE } from '../utils/hid-usage.js';
import './hid-usage-select.js';

@customElement('intg-editor')
export class IntgEditor extends LitElement {
  protected override createRenderRoot() {
    return this;
  }

  @property({ type: Number }) profileId!: number;
  @property({ type: Number }) intgId!: number;

  @state() private _local: Btj.IntgConfig = Btj.IntgConfig.default();

  override willUpdate(changed: any) {
    if (changed.has('profileId') || changed.has('intgId')) {
      if (this.profileId !== undefined && this.intgId !== undefined) {
        this._local = btj.profiles.get(this.profileId)?.intgs.get(this.intgId) ?? Btj.IntgConfig.default();
      }
    }
  }

  private emitEdit() {
    btj.setIntgConfig(this.profileId, this.intgId, this._local);
  }

  private renderSource() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Source</label>
        <hid-usage-select
          .value=${cfg.source}
          .filter=${['analog']}
          @change=${(e: CustomEvent) => {
        this._local = { ...this._local, source: e.detail.value };
        this.emitEdit();
      }}
        ></hid-usage-select>
      </div>
    `;
  }

  private renderMode() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Mode</label>
        <select
          class="form-select"
          .value=${String(cfg.mode)}
          @change=${(e: Event) => {
        const select = e.target as HTMLSelectElement;
        this._local = { ...this._local, mode: Number(select.value) };
        this.emitEdit();
      }}
        >
          <option value="0" ?selected=${cfg.mode === Btj.IntgMode.RELATIVE}>Relative</option>
          <option value="1" ?selected=${cfg.mode === Btj.IntgMode.ABSOLUTE}>Absolute</option>
        </select>
      </div>
    `;
  }

  // Render dead zone as slide, 0-20%
  private renderDeadZone() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Dead Zone (${cfg.deadZone}%)</label>
        <input
          type="range"
          class="form-range"
          min="0"
          max="20"
          .value=${String(cfg.deadZone)}
          @input=${(e: Event) => {
        const input = e.target as HTMLInputElement;
        this._local = { ...this._local, deadZone: Number(input.value) };
      }}
          @change=${() => {
        this.emitEdit();
      }}        />
      </div>
    `;
  }

  private renderGain() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Multiplier</label>
        <input
          type="number"
          step="0.001"
          class="form-control"
          .value=${String(cfg.gain ?? '')}
          @input=${(e: Event) => {
        this._local = { ...this._local, gain: Number((e.target as HTMLInputElement).value) };
      }}
          @change=${() => {
        this.emitEdit();
      }}/>
      </div>
    `;
  }

  private renderMax() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Max Steps</label>
        <input
          class="form-control"
          .value=${String(cfg.max ?? '')}
          @input=${(e: Event) => {
        this._local = { ...this._local, max: Number((e.target as HTMLInputElement).value) };
      }}
          @change=${() => {
        this.emitEdit();
      }}/>
      </div>
    `;
  }

  override render() {
    const mode = this._local.mode;
    const usageType = HID_USAGE_TYPE[this._local.source];
    return html`
      <div class="card">
        <div class="row g-0 align-items-stretch">
          <div class="col-auto">
            <div class="h-100 bg-body-secondary border-end px-3 py-2 d-flex align-items-center">
              <h5 class="card-title mb-0">Int ${this.intgId}</h5>
            </div>
          </div>
          <div class="col">
            <div class="card-body">
              <div class="row g-4" >
                <div class="col-12 col-xl-2">
                  ${this.renderSource()}
                </div>


                <div class="col-6 col-xl-2">
                  ${usageType != '' ? this.renderMode() : ''}
                </div>
                <div class="col-6 col-xl-2">
                  ${usageType != '' && mode === Btj.IntgMode.ABSOLUTE ? this.renderDeadZone() : ''}
                </div>
                <div class="col-6 col-xl-2">
                  ${usageType != '' ? this.renderGain() : ''}
                </div>
                <div class="col-12 col-xl-2">
                  ${usageType != '' ? this.renderMax() : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'intg-editor': IntgEditor;
  }
}
