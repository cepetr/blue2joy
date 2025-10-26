import { MobxLitElement } from '@adobe/lit-mobx';
import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { btj } from '../models/btj-model.js';
import { Btj } from '../services/btj-messages.js';

@customElement('scan-dialog')
export class ScanDialog extends MobxLitElement {
  // Render in light DOM so global Bootstrap CSS applies
  protected override createRenderRoot() {
    return this;
  }

  @state() private _scanning = false;
  @state() private _error: string | null = null;

  private async startScan() {
    if (!btj.conn) {
      this._error = 'Not connected to btj device';
      return;
    }
    this._error = null;
    try {
      await btj.conn.invoke(new Btj.SetMode(Btj.SysMode.MANUAL, true));
      await btj.conn.invoke(new Btj.StartScanning());
      this._scanning = true;
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
  }

  private async stopScan() {
    if (!btj.conn) return;
    try {
      await btj.conn.invoke(new Btj.StopScanning());
    } catch (err: any) {
      // ignore
    }
    this._scanning = false;
  }

  private async connect(addr: Btj.DevAddr) {
    if (!btj.conn) {
      return;
    }
    this._error = null;
    try {
      await this.stopScan();
      await btj.conn.invoke(new Btj.ConnectDevice(addr));
      this.onClose();
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
  }

  private onClose() {
    this.stopScan();
    this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
  }

  override render() {
    return html`
      <div class="modal d-block" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Scan for HID devices</h5>
              <button type="button" class="btn-close" aria-label="Close" @click=${() => this.onClose()}></button>
            </div>
            <div class="modal-body">
              ${this._error ? html`<div class="alert alert-danger" role="alert">${this._error}</div>` : ''}
              <table class="table table-sm">
                <thead><tr><th>Address</th><th>Name</th><th>RSSI</th><th></th></tr></thead>
                <tbody>
                  ${btj.advDevices.length === 0 ? html`<tr><td colspan="4">No devices yet</td></tr>` : btj.advDevices.map(a => html`
                    <tr>
                      <td>${a.addr.toString()}</td>
                      <td>${a.name}</td>
                      <td>${a.rssi}</td>
                      <td>
                        <button type="button" class="btn btn-primary btn-sm" @click=${() => this.connect(a.addr)}>Connect</button>
                      </td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
            <div class="modal-footer">
              ${this._scanning
        ? html`<button class="btn btn-secondary" @click=${() => this.stopScan()}>Stop</button>`
        : html`<button class="btn btn-primary" @click=${() => this.startScan()}>Start</button>`}
              <button class="btn btn-outline-secondary" @click=${() => this.onClose()}>Close</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'scan-dialog': ScanDialog;
  }
}
