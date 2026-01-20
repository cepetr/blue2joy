import { MobxLitElement } from "@adobe/lit-mobx";
import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { btj, DeviceEntry } from "../models/btj-model.js";
import { Btj } from "../services/btj-messages.js";

@customElement("devices-view")
export class DevicesView extends MobxLitElement {
  protected override createRenderRoot() {
    return this;
  }

  private onProfileChange(dev: DeviceEntry, e: Event) {
    const profileId = parseInt((e.target as HTMLSelectElement).value);
    btj.setDeviceProfile(dev.addr, profileId);
  }

  private renderDeviceRow(dev: DeviceEntry) {
    return html`
      <tr>
        <td>${dev.addr.toString()}</td>
        <td>${Btj.ConnState[dev.state?.connState]}</td>

        <td>
          <select
            class="form-select form-select-sm"
            @change=${(e: Event) => this.onProfileChange(dev, e)}
          >
            ${[0, 1, 2, 3, 4].map(p => html`
              <option
                value=${String(p)}
                ?selected=${p === (dev.config?.profile ?? 0)}
              >
                ${p}
              </option>
           `)}
          </select>
        </td>

        <td class="text-end">
          <button
            type="button"
            class="btn btn-outline-danger btn-sm"
            @click=${() => btj.deleteDevice(dev.addr)}
            title="Delete device"
          >
            <span class="d-none d-md-inline">Delete</span>
            <i class="d-md-none bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }

  private renderDeviceTable() {
    return html`
      <div class="table-responsive">
        <table class="table table-striped table-sm">

          <thead>
            <tr>
              <th>MAC Address</th>
              <th>State</th>
              <th>Profile</th>
              <th class="text-end"><span class="d-none d-sm-inline">Actions</span></th>
            </tr>
          </thead>

          <tbody>
            ${btj.devices.length === 0 ? html`
              <tr>
                <td colspan="4">No devices found.</td>
              </tr>
            `: btj.devices.map(dev => this.renderDeviceRow(dev))}
          </tbody>

        </table>
      </div>
    `;
  }


  private renderScanTable() {
    return html`
      <div class="table-responsive">
        <table class="table table-striped table-sm">

          <thead>
            <tr>
              <th>Address</th>
              <th>Name</th>
              <th>RSSI</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            ${btj.advDevices.length === 0 ? html`
              <tr>
                <td colspan="4">No devices yet</td>
              </tr>
            `: btj.advDevices.map(a => html`
              <tr>
                <td>${a.addr.toString()}</td>
                <td>${a.name}</td>
                <td>${a.rssi}</td>
                <td>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    @click=${() => btj.connectDevice(a.addr)}
                  >
                    Connect
                  </button>
                </td>
              </tr>
            `)}
          </tbody>

        </table>
      </div>
    `;
  }

  override render() {
    const scanning = btj.sysState?.scanning && (btj.sysState?.mode === Btj.SysMode.MANUAL);

    return html`
      ${this.renderDeviceTable()}

      ${!scanning ? html`
        <button
          type="button"
          class="btn btn-primary"
          @click=${() => { btj.startScanning() }}
        >
          Start scanning
        </button>

        ` : html`
        <button
          type="button"
          class="btn btn-danger"
          @click=${() => { btj.stopScanning() }}
        >
          Stop scanning
        </button>
        `
      }

      ${scanning ? this.renderScanTable() : ''}
`;
  }
}

// Add to global HTMLElementTagNameMap
declare global {
  interface HTMLElementTagNameMap {
    "devices-view": DevicesView;
  }
}
