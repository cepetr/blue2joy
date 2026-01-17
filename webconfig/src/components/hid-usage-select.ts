import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { HID_USAGE_LABELS, HID_USAGE_TYPE, HidControlType, HidUsage } from '../utils/hid-usage.js';

// Get sorted list of all usages
const ALL_USAGES = Object.values(HidUsage)
  .filter(v => typeof v === 'number')
  .sort((a, b) => (a as number) - (b as number)) as number[];

@customElement('hid-usage-select')
export class HidUsageSelect extends LitElement {
  protected override createRenderRoot() {
    return this;
  }

  @property({ type: Number })
  value: number = HidUsage.X;

  @property({ type: Boolean })
  disabled = false;

  @property({ type: Array })
  filter: HidControlType[] = [];

  private handleChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    const newValue = parseInt(select.value, 10);
    this.value = newValue;
    this.dispatchEvent(new CustomEvent('change', {
      detail: { value: newValue },
      bubbles: true,
      composed: true
    }));
  }

  override render() {
    const isKnownValue = ALL_USAGES.includes(this.value);
    const hexValue = `0x${this.value.toString(16).toUpperCase().padStart(4, '0')}`;

    // Filter usages based on the filter property
    let filteredUsages = ALL_USAGES;
    if (this.filter.length > 0) {
      filteredUsages = ALL_USAGES.filter(usage =>
        HID_USAGE_TYPE[usage] === '' ||
        this.filter.includes(HID_USAGE_TYPE[usage] || '')
      );
    }

    return html`
      <select
        class="form-select"
        key=${this.value}
        @change=${this.handleChange}
        ?disabled=${this.disabled}
      >
        ${!isKnownValue ? html`
          <option value=${String(this.value)} selected>
            ${hexValue}
          </option>
        ` : ''}
        ${filteredUsages.map(usage => html`
          <option value=${String(usage)} ?selected=${usage === this.value}>
            ${HID_USAGE_LABELS[usage] || `0x${usage.toString(16).toUpperCase()}`}
          </option>
        `)}
      </select>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hid-usage-select': HidUsageSelect;
  }
}
