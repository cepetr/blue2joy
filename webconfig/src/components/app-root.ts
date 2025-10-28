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
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { btj } from "../models/btj-model.js";
import { Btj } from "../services/btj-messages.js";
import '../styles/bootstrap';

import "./devices-view.js";
import "./profiles-view.js";

@customElement("app-root")
export class AppRoot extends MobxLitElement {
  protected override createRenderRoot() {
    return this;
  }

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


  private renderNotConnected() {
    return html`
      <div class="text-center pt-4">
        <h3>No device is connected.</h3>
        <p>Please press the button and select the device to connect.</p>
        <button class="btn btn-primary" @click=${this.onScanClick}
          ?disabled=${this.busy}>
          ${this.busy ? 'Scanning…' : 'Select a Blue2Joy device'}
        </button>
        ${btj.error ? html`
          <article role="alert">
            <p>${btj.error}</p>
          </article>
        ` : null}
      </div>
    `;
  }

  private renderInfo() {
    return html`
      ${btj.sysInfo && btj.sysState ? html`
        <span class="vr mx-2"></span>
        <span class="navbar-text d-none d-sm-inline">ID: ${btj.sysInfo?.hw_id}</span>
        <span class="navbar-text d-none d-sm-inline">FW: ${btj.sysInfo?.sw_version}</span>
        <span class="navbar-text">${Btj.SysMode[btj.sysState!.mode]}</span>
        <span class="navbar-text">${btj.sysState?.scanning ? "SCANNING" : ""}</span>

      ` : null}
    `;
  }

  private renderMenu() {
    const currentPath = location.pathname;
    const profileIds = Array.from(btj.profiles.keys());
    const profilesVisible = btj.connected && profileIds.length > 0;
    return html`
      <ul class="navbar-nav me-auto">
        <li class="nav-item ${btj.connected ? '' : 'd-none'}">
          <a class="nav-link ${currentPath.includes('/devices') ? 'active' : ''}" aria-current="page" href="/devices">Devices</a>
        </li>
        <li class="nav-item dropdown ${profilesVisible ? '' : 'd-none'}">
          <a class="nav-link dropdown-toggle ${currentPath.includes('/profiles') ? 'active' : ''}" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
            Profiles
          </a>
          <ul class="dropdown-menu">
            ${profileIds.map(id => html`
              <li>
                <a class="dropdown-item ${currentPath === `/profiles/${id}` ? 'active' : ''}" href="/profiles/${id}">
                  Profile ${id}
                </a>
              </li>
            `)}
          </ul>
        </li>
      </ul>
      ${btj.connected ? html`
        <button class="btn btn-outline-secondary" @click=${this.disconnect}>Disconnect</button>
      ` : html`
        <span class="navbar-text">NOT CONNECTED</span>
      `}
    `;
  }

  private renderNavbar() {
    return html`
      <nav class="navbar navbar-expand-lg sticky-top bg-body-tertiary">
        <div class="container-fluid">
          <a class="navbar-brand">🕹️</a>
          <a class="navbar-brand" href="#">Blue2Joy</a>
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNavDropdown" aria-controls="navbarNavDropdown" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" id="navbarNavDropdown">
            <div class="d-flex align-items-left gap-3">
              ${this.renderInfo()}
            </div>
            <div class="d-flex align-items-center ms-auto gap-3">
              ${this.renderMenu()}
            </div>
          </div>
        </div>
      </nav>
    `;
  }

  override render() {
    return html`
      <div class="container">
        <div class="row">
          ${this.renderNavbar()}
        </div>
        <div class="row">
          ${btj.connected ? this.router.outlet() : this.renderNotConnected()}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-root": AppRoot;
  }
}

