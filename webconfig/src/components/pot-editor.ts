import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { btj } from '../models/btj-model.js';
import { Btj } from '../services/btj-messages.js';
import { HID_USAGE_TYPE } from '../utils/hid-usage.js';
import './hid-usage-select.js';

@customElement('pot-editor')
export class PotEditor extends LitElement {
  protected override createRenderRoot() {
    return this;
  }

  @property({ type: Number }) profileId!: number;
  @property({ type: Number }) potId!: number;

  @state() private _local: Btj.PotConfig = Btj.PotConfig.default();

  override willUpdate(changed: any) {
    if (changed.has('profileId') || changed.has('potId')) {
      if (this.profileId !== undefined && this.potId !== undefined) {
        this._local = btj.profiles.get(this.profileId)?.pots.get(this.potId) ?? Btj.PotConfig.default();
      }
    }
  }

  private emitEdit() {
    btj.setPotConfig(this.profileId, this.potId, this._local);
  }

  private renderSource() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Source</label>
        <hid-usage-select
          .value=${cfg.source}
          .filter=${['digital', 'analog', 'analog-intg']}
          @change=${(e: CustomEvent) => {
        this._local = { ...this._local, source: e.detail.value };
        this.emitEdit();
      }}
        ></hid-usage-select>
      </div>
    `;
  }

  private renderMin() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Min</label>
        <input
          class="form-control"
          .value=${String(cfg.low ?? '')}
          @input=${(e: Event) => {
        this._local = { ...this._local, low: Number((e.target as HTMLInputElement).value) };
      }}
          @change=${() => {
        this.emitEdit();
      }}        />
      </div>
    `;
  }

  private renderMax() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Max</label>
        <input
          class="form-control"
          .value=${String(cfg.high ?? '')}
          @input=${(e: Event) => {
        this._local = { ...this._local, high: Number((e.target as HTMLInputElement).value) };
      }}
          @change=${() => {
        this.emitEdit();
      }}/>
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
              <h5 class="card-title mb-0">Pot ${this.potId}</h5>
            </div>
          </div>
          <div class="col">
            <div class="card-body">
              <div class="row g-4">
                <div class="col-12 col-xl-2">
                  ${this.renderSource()}
                </div>
                <div class="d-none d-xl-block col-xl-2">
                </div>
                <div class="col-6 col-xl-2">
                  ${usageType != '' ? this.renderMin() : ''}
                </div>
                <div class="col-6 col-xl-2">
                  ${usageType != '' ? this.renderMax() : ''}
                </div>
                <div class="col-12 col-xl-2">
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
    'pot-editor': PotEditor;
  }
}
