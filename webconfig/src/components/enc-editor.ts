import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { btj } from '../models/btj-model.js';
import { Btj } from '../services/btj-messages.js';
import { HID_USAGE_TYPE } from '../utils/hid-usage.js';
import './hid-usage-select.js';

@customElement('enc-editor')
export class EncEditor extends LitElement {
  protected override createRenderRoot() {
    return this;
  }

  @property({ type: Number }) profileId!: number;
  @property({ type: Number }) encId!: number;

  @state() private _local: Btj.EncConfig = Btj.EncConfig.default();

  override willUpdate(changed: any) {
    if (changed.has('profileId') || changed.has('encId')) {
      if (this.profileId !== undefined && this.encId !== undefined) {
        this._local = btj.profiles.get(this.profileId)?.encs.get(this.encId) ?? Btj.EncConfig.default();
      }
    }
  }

  private emitEdit() {
    btj.setEncConfig(this.profileId, this.encId, this._local);
  }

  private renderSource() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Source</label>
        <hid-usage-select
          .value=${cfg.source}
          @change=${(e: CustomEvent) => {
        this._local = { ...this._local, source: e.detail.value };
        this.emitEdit();
      }}
        ></hid-usage-select>
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
              <h5 class="card-title mb-0">Enc ${this.encId}</h5>
            </div>
          </div>
          <div class="col">
            <div class="card-body">
              <div class="row g-4">
                <div class="col-12 col-xl-2">
                  ${this.renderSource()}
                </div>
                <div class="d-none d-xl-block col-xl-4">
                </div>
                <div class="col-6 col-xl-2">
                </div>
                <div class="col-6 col-xl-2">
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
    'enc-editor': EncEditor;
  }
}
