import { MobxLitElement } from '@adobe/lit-mobx';
import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { Btj } from './btj-messages.js';
import { btj } from './btj-model.js';
import { picoSheet } from './styles/pico';

@customElement('scan-dialog')
export class ScanDialog extends MobxLitElement {
  static override styles = [picoSheet];

  @state() private _scanning = false;
  @state() private _error: string | null = null;

  private async startScan() {
    if (!btj.conn) {
      this._error = 'Not connected to btj device';
      return;
    }
    this._error = null;
    try {
      await btj.conn.invoke(new Btj.SetMode(2, true)); // 2 = Manual
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
      <dialog open>
        <article>
          <header>
            <button aria-label="Close" rel="prev" @click=${() => this.onClose()}></button>
            <p>Scan for HID devices</p>
          </header>

          ${this._error ? html`<p class="error">${this._error}</p>` : ''}
          <div>
            <table>
              <thead><tr><th>Address</th><th>Name</th><th>RSSI</th></tr></thead>
              <tbody>
                ${btj.advDevices.length === 0 ? html`<tr><td colspan="3">No devices yet</td></tr>` : btj.advDevices.map(a => html`
                  <tr>
                    <td>${a.addr.toString()}</td>
                    <td>${a.name}</td>
                    <td>${a.rssi}</td>
                    <td>
                      <button type="button" class="button contrast" @click=${() => this.connect(a.addr)}>Connect</button>
                    </td>
                  </tr>
                `)
      }
              </tbody>
  </table>
  </div>

  <footer>
            ${this._scanning ? html`<button class="secondary" @click=${() => this.stopScan()}>Stop</button>` : html`<button class="primary" @click=${() => this.startScan()}>Start</button>`}
<button class="secondary" @click=${() => this.onClose()}> Close </button>
  </footer>
  </article>
  </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'scan-dialog': ScanDialog;
  }
}
