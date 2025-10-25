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
import { btj } from "../models/btj-model.js";
import { picoSheet } from '../styles/pico.js';

import "./devices-view.js";
import "./profiles-view.js";

@customElement("app-root")
export class AppRoot extends MobxLitElement {
  static override styles = [
    picoSheet,
    css`
      :host {
        display: block;
        --header-height: 60px;
        --sidebar-width: 220px;
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
        border-bottom: 1px solid #e0e0e0;
        z-index: 100;
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 0.5em;
      }

      .header-left img {
        height: 2em;
        width: 2em;
        object-fit: contain;
      }

      .device-info {
        margin-left: 1em;
        opacity: 0.85;
        font-size: 0.9em;
      }

      .sidebar {
        position: fixed;
        top: var(--header-height);
        left: 0;
        width: var(--sidebar-width);
        height: calc(100vh - var(--header-height));
        background: white;
        overflow-y: auto;
        padding: 1rem 0;
      }

      .sidebar nav ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .sidebar nav li {
        margin: 0;
      }

      .sidebar nav a {
        display: block;
        padding: 0.6rem 1.5rem;
        text-decoration: none;
        color: inherit;
        transition: background-color 0.2s;
      }

      .sidebar nav a:hover {
        background-color: #f5f5f5;
      }

      .sidebar nav a.active {
        background-color: var(--pico-primary);
        color: white;
        font-weight: 500;
      }

      .sidebar .menu-group {
        padding: 0.6rem 1.0rem;
        color: #666;
      }

      .sidebar .menu-submenu {
        padding-left: 1rem;
      }

      .content {
        margin-top: var(--header-height);
        margin-left: var(--sidebar-width);
        height: calc(100vh - var(--header-height));
        padding: 1.5rem;
        background: #f6f6f6;
        overflow-y: auto;
      }
    `
  ];

  @state() private busy = false;

  private router: Router;

  constructor() {
    super();
    this.router = new Router(this, [
      { path: '/', render: () => html`<devices-view></devices-view>` },
      { path: '/devices', render: () => html`<devices-view></devices-view>` },
      {
        path: '/profiles/:id', render: (params) => {
          const profileId = parseInt(params.id as string, 10);
          return html`<profiles-view .profileId=${profileId}></profiles-view>`;
        }
      },
      { path: '/profiles', render: () => html`<profiles-view .profileId=${0}></profiles-view>` },
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

  private renderSidebar() {
    if (!btj.connected) return null;

    const currentPath = location.pathname;
    const profileIds = Array.from(btj.profiles.keys());

    return html`
      <aside class="sidebar">
        <nav>
          <ul>
            <li>
              <a href="/devices" class=${currentPath === '/devices' || currentPath === '/' ? 'active' : ''}>
                Devices
              </a>
            </li>
            <li>
              <div class="menu-group">Profiles</div>
              <ul class="menu-submenu">
                ${profileIds.map(id => html`
                  <li>
                    <a href="/profiles/${id}" class=${currentPath === `/profiles/${id}` ? 'active' : ''}>
                      Profile ${id}
                    </a>
                  </li>
                `)}
              </ul>
            </li>
          </ul>
        </nav>
      </aside>
    `;
  }

  private renderHeader() {
    return html`
      <div class="header-left">
        <img src="/logo.svg" alt="logo" />
        <strong>blue2joy</strong>
        <span class="device-info">${this.renderDeviceInfo()}</span>
        ${btj.sysState?.scanning ? html`<span style="margin-left:0.5em;color:var(--pico-primary);font-weight:bold">SCANNING</span>` : ''}
      </div>
      <div>
        ${btj.connected ? html`
          <button class="secondary" @click=${this.disconnect}>Disconnect</button>
        ` : null}
      </div>
    `;
  }

  override render() {
    return html`
      <header class="header">
        ${this.renderHeader()}
      </header>
      ${this.renderSidebar()}
      <main class="content">
        ${btj.connected
        ? this.router.outlet()
        : this.renderNotConnected()
      }
      </main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-root": AppRoot;
  }
}
