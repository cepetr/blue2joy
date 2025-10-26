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
      <div class="card h-100">
        <div class="card-header py-2">
          <h5 class="card-title mb-0">Pot ${this.potId}</h5>
        </div>
        <div class="card-body">
          ${this.renderSource()}
          ${this.renderMin()}
          ${this.renderMax()}
          ${this.renderIntegrationSpeed()}
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
