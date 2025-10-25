import { MobxLitElement } from "@adobe/lit-mobx";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { btj } from "./btj-model.js";
import './scan-dialog.js';
import { picoSheet } from './styles/pico';

@customElement("hid-devices")
export class HidDevices extends MobxLitElement {
  static override styles = [picoSheet]

  @state()
  private _scanOpen = false;

  override render() {
    return html`
      <h2>HID Devices</h2>
      <table>
        <thead>
          <tr>
            <th>Address</th>
            <th>State</th>
            <th>Profile</th>
          </tr>
        </thead>
        <tbody>
          ${btj.devices.length === 0
        ? html`<tr><td colspan="3">No devices found.</td></tr>`
        : btj.devices.map(dev => html`
                <tr>
                  <td>${dev.addr.toString()}</td>
                  <td>${dev.state?.connState}</td>
                  <td>${dev.config?.profile}</td>
                </tr>
              `)
      }
        </tbody>
      </table>
      <p class="actions">
        <button type="button" class="primary" @click=${() => { this._scanOpen = true }}>Scan</button>
      </p>
      ${this._scanOpen ? html`<scan-dialog @close=${() => { this._scanOpen = false }}></scan-dialog>` : ''}
    `;
  }
}

// Add to global HTMLElementTagNameMap
declare global {
  interface HTMLElementTagNameMap {
    "hid-devices": HidDevices;
  }
}
