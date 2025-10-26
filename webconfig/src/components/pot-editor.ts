import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Btj } from '../services/btj-messages.js';
import './hid-usage-select.js';

@customElement('pot-editor')
export class PotEditor extends LitElement {
  protected override createRenderRoot() {
    return this;
  }

  @property({ type: Number }) profileId!: number;
  @property({ type: Number }) potId!: number;
  @property({ attribute: false }) config?: Btj.PotConfig;

  @state() private _local: Btj.PotConfig = { source: 0, low: 0, high: 0, intSpeed: 0 };

  override willUpdate(changed: any) {
    if (this.config && changed.has('config')) {
      this._local = { ...this.config } as Btj.PotConfig;
    }
  }

  private emitEdit() {
    const detail = { type: 'pot', id: this.potId, config: { ...this._local } };
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

  private renderMin() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Min</label>
        <input
          class="form-control"
          .value=${String(cfg.low ?? '')}
          @input=${(e: Event) => {
        this._local.low = Number((e.target as HTMLInputElement).value);
        this.emitEdit();
      }}
        />
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
        this._local.high = Number((e.target as HTMLInputElement).value);
        this.emitEdit();
      }}
        />
      </div>
    `;
  }

  private renderIntegrationSpeed() {
    const cfg = this._local;
    return html`
      <div class="mb-2">
        <label class="form-label">Integration Speed</label>
        <input
          class="form-control"
          .value=${String(cfg.intSpeed ?? '')}
          @input=${(e: Event) => {
        this._local.intSpeed = Number((e.target as HTMLInputElement).value);
        this.emitEdit();
      }}
        />
      </div>
    `;
  }

  override render() {
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
                <div class="col-12 col-xl-4">
                </div>
                <div class="col-6 col-xl-2">
                  ${this.renderMin()}
                </div>
                <div class="col-6 col-xl-2">
                  ${this.renderMax()}
                </div>
                <div class="col-12 col-xl-2">
                  ${this.renderIntegrationSpeed()}
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
