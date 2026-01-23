import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
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

  private handleChange = (e: Event) => {
    const select = e.target as HTMLSelectElement;
    const newValue = parseInt(select.value, 10);
    this.value = newValue;
    this.dispatchEvent(new CustomEvent('change', {
      detail: { value: newValue },
      bubbles: true,
      composed: true
    }));
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has('value') || changed.has('filter')) {
      const select = this.querySelector('select');
      if (select) select.value = String(this.value);
    }
  }

  override render() {
    const hexValue = `0x${this.value.toString(16).toUpperCase().padStart(4, '0')}`;

    // Filter usages based on the filter property
    const renderedOptions =
      this.filter.length > 0
        ? ALL_USAGES.filter(usage =>
          HID_USAGE_TYPE[usage] === '' ||
          this.filter.includes(HID_USAGE_TYPE[usage] || '')
        )
        : ALL_USAGES;

    const inRendered = renderedOptions.includes(this.value);


    return html`
      <select
        class="form-select"
        @change=${this.handleChange}
        ?disabled=${this.disabled}
      >
        ${!inRendered
        ? html`<option value=${String(this.value)}>${hexValue}</option>`
        : nothing}

        ${repeat(
          renderedOptions,
          usage => usage, // key by the usage number
          usage => html`
            <option value=${String(usage)}>
              ${HID_USAGE_LABELS[usage] ?? `0x${usage.toString(16).toUpperCase()}`}
            </option>
          `
        )}
      </select>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hid-usage-select': HidUsageSelect;
  }
}
