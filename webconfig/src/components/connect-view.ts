/*
 * This file is part of the Blue2Joy project
 * (https://github.com/cepetr/blue2joy).
 * Copyright (c) 2025
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { MobxLitElement } from "@adobe/lit-mobx";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { btj } from "../models/btj-model.js";

@customElement("connect-view")
export class ConnectView extends MobxLitElement {
  protected override createRenderRoot() {
    return this;
  }

  @state() private busyAction: "bluetooth" | "usb" | "demo" | null = null;

  private onScanClick = async () => {
    try {
      this.busyAction = "bluetooth";
      await btj.scanAndConnect();
    } finally {
      this.busyAction = null;
    }
  };

  private onUsbClick = async () => {
    try {
      this.busyAction = "usb";
      await btj.scanAndConnectUsb();
    } finally {
      this.busyAction = null;
    }
  };

  private onDemoClick = async () => {
    try {
      this.busyAction = "demo";
      await btj.connectDemo();
    } finally {
      this.busyAction = null;
    }
  };

  private onDismissErrors = () => {
    btj.clearErrors();
  };

  private onReconnectClick = async () => {
    if (!btj.lastTransport) {
      return;
    }
    try {
      this.busyAction = btj.lastTransport;
      await btj.reconnectLastTransport();
    } finally {
      this.busyAction = null;
    }
  };

  private renderBluetoothConnectBox(busy: boolean) {
    return html`
      <div class="col-12">
        <div
          class="border rounded-3 p-3 text-start bg-body-tertiary mx-auto"
          style="max-width: 42rem;"
        >
          <div class="d-flex align-items-center justify-content-between gap-3">
            <div class="flex-grow-1">
              <h5 class="mb-1">Bluetooth</h5>
              <p class="text-body-secondary mb-0">
                For wireless setup from this device.
              </p>
              <p class="small text-warning mb-0 mt-1">
                Before connecting, press button 2 on your Blue2Joy device so it
                becomes discoverable.
              </p>
            </div>
            <div style="width:8.75rem;flex-shrink:0;">
              <button
                class="btn btn-primary w-100"
                style="padding-block: 0.5625rem;"
                @click=${this.onScanClick}
                ?disabled=${busy}
              >
                <span class="d-block">Connect</span>
                <span class="d-block small">via Bluetooth</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderUsbConnectBox(busy: boolean) {
    return html`
      <div class="col-12">
        <div
          class="border rounded-3 p-3 text-start bg-body-tertiary mx-auto"
          style="max-width: 42rem;"
        >
          <div class="d-flex align-items-center justify-content-between gap-3">
            <div class="flex-grow-1">
              <h5 class="mb-1">USB</h5>
              <p class="text-body-secondary mb-0">
                For best performance with lower lag (recommended for XEP80).
              </p>
            </div>
            <div style="width:8.75rem;flex-shrink:0;">
              <button
                class="btn btn-primary w-100"
                style="padding-block: 0.5625rem;"
                @click=${this.onUsbClick}
                ?disabled=${busy}
              >
                <span class="d-block">Connect</span>
                <span class="d-block small">via USB</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderDemoConnectBox(busy: boolean) {
    return html`
      <div class="col-12">
        <div
          class="border rounded-3 p-3 text-start bg-body-tertiary mx-auto"
          style="max-width: 42rem;"
        >
          <div class="d-flex align-items-center justify-content-between gap-3">
            <div class="flex-grow-1">
              <h5 class="mb-1">Demo Mode</h5>
              <p class="text-body-secondary mb-0">
                Try the app without hardware using a virtual Blue2Joy device.
              </p>
            </div>
            <div style="width:8.75rem;flex-shrink:0;">
              <button
                class="btn btn-outline-primary w-100"
                style="padding-block: 0.5625rem;"
                @click=${this.onDemoClick}
                ?disabled=${busy}
              >
                <span class="d-block">Start</span>
                <span class="d-block small">Demo Mode</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderErrorState(busy: boolean) {
    return html`
      <div class="text-center pt-4">
        <h3>Connection failed</h3>
        <p class="mb-4">Check the messages below, then try again.</p>

        <div class="row g-3 justify-content-center">
          ${btj.errors.map(
            (err) => html`
              <div class="col-12">
                <div
                  class="border rounded-3 p-3 text-start bg-body-tertiary mx-auto"
                  style="max-width: 42rem;"
                >
                  <h5 class="mb-1 text-danger">
                    ${err.source ? `${err.source}` : "Connection error"}
                  </h5>
                  <p class="mb-0">${err.message}</p>
                </div>
              </div>
            `,
          )}
        </div>

        <div class="mx-auto mt-3" style="max-width: 42rem;">
          <div class="d-flex justify-content-end">
            <button
              type="button"
              class="btn btn-outline-primary me-2"
              ?disabled=${busy}
              @click=${this.onDismissErrors}
            >
              Choose another method
            </button>
            ${btj.lastTransport
              ? html`
                  <button
                    type="button"
                    class="btn btn-primary"
                    @click=${this.onReconnectClick}
                    ?disabled=${busy}
                  >
                    Try again
                  </button>
                `
              : null}
          </div>
        </div>
      </div>
    `;
  }

  override render() {
    const busy = this.busyAction !== null;

    if (btj.errors.length > 0) {
      return this.renderErrorState(busy);
    }

    return html`
      <div class="text-center pt-4">
        <h3>Connect to Blue2Joy</h3>
        <p class="mb-4">
          Choose a connection method for hardware, or start Demo Mode.
        </p>

        <div class="row g-3 justify-content-center">
          ${this.renderBluetoothConnectBox(busy)}
          ${this.renderUsbConnectBox(busy)}
          ${this.renderDemoConnectBox(busy)}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "connect-view": ConnectView;
  }
}
