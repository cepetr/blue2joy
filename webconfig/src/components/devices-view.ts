import { MobxLitElement } from "@adobe/lit-mobx";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { btj } from "../models/btj-model.js";
import { Btj } from "../services/btj-messages.js";
import { picoSheet } from '../styles/pico.js';
import "./scan-dialog.js";

@customElement("devices-view")
export class DevicesView extends MobxLitElement {
  static override styles = [picoSheet]

  @state()
  private _scanOpen = false;


  override render() {
    return html`
      <h2>HID Devices</h2>
      <table>
        <thead>
          <tr>
            <th>MAC Address</th>
            <th>Sstate</th>
            <th>Profile</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${btj.devices.length === 0
        ? html`<tr><td colspan="4">No devices found.</td></tr>`
        : btj.devices.map(dev => html`
                <tr>
                  <td>${dev.addr.toString()}</td>
                  <td>${Btj.ConnState[dev.state?.connState]}</td>
                  <td>
                    <select
                      @change=${(e: Event) => btj.setDeviceProfile(dev.addr, parseInt((e.target as HTMLSelectElement).value))}
                      ?disabled=${!btj.conn}
                    >
                      ${[0, 1, 2, 3, 4].map(p => html`<option value=${String(p)} ?selected=${p === (dev.config?.profile ?? 0)}>${p}</option>`)}
                    </select>
                  </td>
                  <td>
                    <button type="button" class="button contrast" @click=${() => btj.deleteDevice(dev.addr)} ?disabled=${!btj.conn}>Delete</button>
                  </td>
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
    "devices-view": DevicesView;
  }
}
