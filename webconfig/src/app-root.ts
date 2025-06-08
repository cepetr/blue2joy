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
import { Router } from '@lit-labs/router';
import { css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { btj } from "./btj-model.js";
import { picoSheet } from './styles/pico';

import "./hid-devices";
import "./hid-profiles";

@customElement("app-root")
export class AppRoot extends MobxLitElement {
  static override styles = [
    picoSheet,
    css`
      :host {
        display: block;
        --header-height: 80px;
      }

      .header {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: var(--header-height);
        background: white;
        padding: 0 1.5rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .device-info {
        margin-left: 2rem;
        opacity: 0.85;
      }

      .content {
        margin-top: var(--header-height);
        height: calc(100vh - var(--header-height));
        padding: 1.5rem;
        background: #f6f6f6;
      }

      nav a.active {
        font-weight: bold;
      }
    `
  ];

  @state() private busy = false;

  private router: Router;

  constructor() {
    super();
    this.router = new Router(this, [
      { path: '/', render: () => html`<hid-devices></hid-devices>` },
      { path: '/devices', render: () => html`<hid-devices></hid-devices>` },
      { path: '/profiles', render: () => html`<hid-profiles></hid-profiles>` },
      { path: '/terminal', render: () => this.renderTerminal() },
      { path: '/.*', render: () => html`<h2>Not found</h2>` },
    ]);
  }

  private async onScanClick() {
    try {
      this.busy = true;
      await btj.scanAndConnect();
    } finally {
      this.busy = false;
    }
  }

  private disconnect() {
    btj.disconnect();
  }

  private renderDeviceInfo() {
    if (!btj.connected) return html`<span>Not connected</span>`;
    return html`
      <span>ID: ${btj.sysInfo?.hw_id}</span>
      <span style="margin-left:1em;">FW: ${btj.sysInfo?.sw_version}</span>
    `;
  }

  private renderNotConnected() {
    return html`
      <h2>No device is connected.</h2>
      <p>Please press the button and select the device to connect.</p>
      <p>
        <button @click=${this.onScanClick} ?disabled = ${this.busy}>
          ${this.busy ? 'Scanning…' : 'Scan for devices'}
        </button>
      </p>
      ${btj.error ? html`
      <article role="alert" style="border-color: var(--pico-primary);">
        <p>${btj.error}</p>
      </article>
      ` : null}
    `;
  }

  private renderTerminal() {
    return html`<h2>Terminal</h2><p>Terminal UI here.</p>`;
  }

  private navLinks() {
    const links = [
      ...(btj.connected ? [
        { path: '/devices', label: 'Devices' },
        { path: '/profiles', label: 'Profiles' },
      ] : []),
      { path: '/terminal', label: 'Terminal' },
    ];
    return links.map(i => {
      const selected = location.pathname === i.path;
      return html`
        <li><a href="${i.path}" class=${selected ? 'active' : ''}>${i.label}</a></li>
      `;
    });
  }

  private renderHeader() {
    return html`
      <nav class="container-fluid">
        <ul>
          <li style="display:flex;align-items:center;gap:0.5em;">
            <img src="/logo.svg" alt="logo" style="height:2em;width:2em;object-fit:contain;" />
            <strong>blue2joy</strong>
            <span class="device-info" style="margin-left:1em;">${this.renderDeviceInfo()}</span>
            ${btj.sysState?.scanning ? html`<span style="margin-left:0.5em;color:var(--pico-primary);font-weight:bold">SCANNING</span>` : ''}
          </li>
        </ul>
        <ul>
          ${this.navLinks()}
          ${btj.connected ? html`
            <li>
              <button class="secondary" @click=${this.disconnect}> Disconnect
              </button>
            </li>
          ` : null}
        </ul>
      </nav>
    `;
  }

  override render() {
    return html`
      <header class="header">
        ${this.renderHeader()}
      </header>
      <main class="content" >
        ${btj.connected
        ? this.router.outlet()
        : this.renderNotConnected()
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-root": AppRoot;
  }
}
