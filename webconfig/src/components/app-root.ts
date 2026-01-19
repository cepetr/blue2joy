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
  private readonly basePath: string;

  constructor() {
    super();
    // Use Vite's BASE_URL which is set at build time from the 'base' config
    // Remove trailing slash for consistency in our route concatenation
    const base = import.meta.env.BASE_URL;
    this.basePath = base.endsWith('/') && base.length > 1 ? base.slice(0, -1) : (base === '/' ? '' : base);

    this.router = new Router(this, [
      { path: this.basePath + '/', render: () => html`<devices-view></devices-view>` },
      { path: this.basePath + '/devices', render: () => html`<devices-view></devices-view>` },
      {
        path: this.basePath + '/profiles/:id', render: (params) => {
          const profileId = parseInt(params.id as string, 10);
          return html`<profiles-view .profileId=${profileId}></profiles-view>`;
        }
      },
      { path: this.basePath + '/profiles', render: () => html`<profiles-view .profileId=${0}></profiles-view>` },
    ]);
  }

  private buildPath(path: string): string {
    return this.basePath + path;
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
        ${this.renderErrors()}
      </div>
    `;
  }

  private renderErrors() {
    if (btj.errors.length === 0) return null;
    return html`
      <div class="mt-3">
        ${btj.errors.map(err => html`
          <div class="alert alert-danger alert-dismissible fade show" role="alert">
            <strong>${err.source ? `${err.source}: ` : ''}</strong>${err.message}
            <button type="button" class="btn-close" @click=${() => btj.removeError(err.id)} aria-label="Close"></button>
          </div>
        `)}
      </div>
    `;
  }

  private renderInfo(mode: 'navbar' | 'offcanvas' = 'navbar') {
    if (!btj.sysInfo || !btj.sysState) return null;
    const scanning = btj.sysState?.scanning ? 'SCANNING' : '';
    if (mode === 'navbar') {
      return html`
        <span class="vr mx-2"></span>
        <span class="navbar-text d-none d-sm-inline">ID: ${btj.sysInfo.hw_id}</span>
        <span class="navbar-text d-none d-sm-inline">FW: ${btj.sysInfo.sw_version}</span>
        <span class="navbar-text">${Btj.SysMode[btj.sysState.mode]}</span>
        <span class="navbar-text">${scanning}</span>
      `;
    }
    return html`
      <ul class="list-unstyled mb-0">
        <li><strong>Device:</strong> ${btj.sysInfo.hw_id}</li>
        <li><strong>Firmware:</strong> ${btj.sysInfo.sw_version}</li>
        <li><strong>Current Mode:</strong> ${Btj.SysMode[btj.sysState.mode]} ${scanning}</li>
      </ul>
    `;
  }

  private renderMenu(mode: 'navbar' | 'offcanvas' = 'navbar') {
    const currentPath = location.pathname;
    const devicesActive = currentPath === this.basePath + '/' || currentPath === this.basePath || currentPath.startsWith(this.basePath + '/devices');
    const profilesActive = currentPath.startsWith(this.basePath + '/profiles');
    const isProfileActive = (id: number) => currentPath === this.basePath + `/profiles/${id}`;
    const profileIds = Array.from(btj.profiles.keys());
    const profilesVisible = btj.connected && profileIds.length > 0;
    if (mode === 'navbar') {
      return html`
        <ul class="navbar-nav me-auto">
          <li class="nav-item ${btj.connected ? '' : 'd-none'}">
            <a class="nav-link ${devicesActive ? 'active' : ''}" aria-current=${devicesActive ? 'page' : undefined} href="${this.buildPath('/devices')}">Devices</a>
          </li>
          <li class="nav-item dropdown ${profilesVisible ? '' : 'd-none'}">
            <a class="nav-link dropdown-toggle ${profilesActive ? 'active' : ''}" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              Profiles
            </a>
            <ul class="dropdown-menu">
              ${profileIds.map(id => html`
                <li>
                  <a class="dropdown-item ${isProfileActive(id) ? 'active' : ''}" href="${this.buildPath(`/profiles/${id}`)}">
                    Profile ${id}
                  </a>
                </li>
              `)}
            </ul>
          </li>
        </ul>
        ${btj.connected ? html`
          <button class="btn btn-outline-secondary ms-3" @click=${this.disconnect}>Disconnect</button>
        ` : html`
          <span class="navbar-text ms-3">NOT CONNECTED</span>
        `}
      `;
    }
    return html`
      <nav class="nav nav-pills flex-column gap-1">
        <a class="nav-link ${btj.connected ? '' : 'disabled'} ${devicesActive ? 'active' : ''}"
           href="${this.buildPath('/devices')}"
           aria-current=${devicesActive ? 'page' : undefined}>Devices</a>
        ${profilesVisible ? html`
          <div class="mt-2 text-muted">Profiles</div>
          ${profileIds.map(id => html`
            <a class="nav-link ${isProfileActive(id) ? 'active' : ''}"
               href="${this.buildPath(`/profiles/${id}`)}"
               aria-current=${isProfileActive(id) ? 'page' : undefined}>
              Profile ${id}
            </a>
          `)}
        ` : null}
        <div class="mt-3">
          <button class="btn btn-outline-secondary w-100" data-bs-dismiss="offcanvas" @click=${() => this.disconnect()}>Disconnect</button>
        </div>
      </nav>
    `;
  }

  private renderNavbar() {
    return html`
      <nav class="navbar navbar-expand-lg sticky-top bg-body-tertiary">
        <div class="container-fluid">
          <a class="navbar-brand d-flex align-items-center gap-2" href="#">
            <span>🕹️</span>
            <span>Blue2Joy</span>
          </a>

          <div class="d-none d-lg-flex w-100 align-items-center gap-3">
            <div class="d-flex align-items-center gap-3">
              ${this.renderInfo('navbar')}
            </div>
            <div class="d-flex align-items-center ms-auto gap-3">
              ${this.renderMenu('navbar')}
            </div>
          </div>

          ${btj.connected ? html`
            <button class="navbar-toggler d-lg-none" type="button" data-bs-toggle="offcanvas" data-bs-target="#appNavOffcanvas" aria-controls="appNavOffcanvas" aria-expanded="false" aria-label="Toggle navigation">
              <span class="navbar-toggler-icon"></span>
            </button>
            <div class="offcanvas offcanvas-end d-lg-none" tabindex="-1" id="appNavOffcanvas" aria-labelledby="appNavOffcanvasLabel">
              <div class="offcanvas-header">
                <h5 class="offcanvas-title" id="appNavOffcanvasLabel">Blue2Joy</h5>
                <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
              </div>
              <div class="offcanvas-body">
                <div class="mb-3">
                  ${this.renderInfo('offcanvas')}
                </div>
                <hr class="my-3">
                ${this.renderMenu('offcanvas')}
              </div>
            </div>
          ` : null}
        </div>
      </nav>
    `;
  }

  override render() {
    return html`
      <div class="container-xl">
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

