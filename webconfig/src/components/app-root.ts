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

import { MobxLitElement } from '@adobe/lit-mobx';
import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { btj } from '../models/btj-model.js';
import { Btj } from '../services/btj-messages.js';
import '../styles/bootstrap';

import './devices-view.js';
import './profiles-view.js';

@customElement('app-root')
export class AppRoot extends MobxLitElement {
  protected override createRenderRoot() {
    return this;
  }

  @state() private busy = false;
  @state() private currentHash = location.hash.slice(1) || '/';

  private buildPath(path: string): string {
    return `#${path}`;
  }

  private isCurrentPath(path: string): boolean {
    return this.currentHash === path || this.currentHash.startsWith(path + '/');
  }

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', this.handleHashChange);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this.handleHashChange);
  }

  private handleHashChange = () => {
    this.currentHash = location.hash.slice(1) || '/';
  }

  private renderRoute() {
    const hash = this.currentHash;

    const profileMatch = hash.match(/^\/profiles\/(\d+)$/);
    if (profileMatch) {
      const profileId = parseInt(profileMatch[1], 10);
      return html`<profiles-view .profileId=${profileId}></profiles-view>`;
    }

    return html`<devices-view></devices-view>`;
  }


  private onScanClick = async () => {
    try {
      this.busy = true;
      await btj.scanAndConnect();
    } finally {
      this.busy = false;
    }
  }

  private disconnect = () => {
    btj.disconnect();
  }

  private onNavLinkClick = (path: string) => {
    window.location.hash = path;
  }

  private renderNotConnected() {
    return html`
      <div class="text-center pt-4">
        <h3>No device is connected.</h3>
        <p>Please press the button and select the device to connect.</p>
        <button
          class="btn btn-primary"
          @click=${this.onScanClick}
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
          <div class="alert alert-danger alert-dismissible fade show"
            role="alert">

            <strong>
              ${err.source ? `${err.source}: ` : ''}
            </strong>

            ${err.message}

            <button
              type="button"
              class="btn-close"
              @click=${() => btj.removeError(err.id)}
              aria-label="Close">
            </button>
          </div>
        `)}
      </div>
    `;
  }

  private renderTopbarInfo() {
    if (!btj.sysInfo || !btj.sysState) return null;
    return html`
        <span class="vr mx-2"></span>

        <span class="navbar-text d-none d-sm-inline">
          ID: ${btj.sysInfo.hw_id}
        </span>

        <span class="navbar-text d-none d-sm-inline">
          FW: ${btj.sysInfo.sw_version}
        </span>

        <span class="navbar-text">
          ${Btj.SysMode[btj.sysState.mode]}
        </span>

        <span class="navbar-text">
          ${btj.sysState?.scanning ? 'SCANNING' : ''}
        </span>
      `;
  }

  private renderSidebarInfo() {
    if (!btj.sysInfo || !btj.sysState) return null;
    return html`
      <ul class="list-unstyled mb-0">
        <li><strong>Device:</strong>
          ${btj.sysInfo.hw_id}
        </li>
        <li>
          <strong>Firmware:</strong>
          ${btj.sysInfo.sw_version}
        </li>
        <li>
          <strong>Current Mode:</strong>
          ${Btj.SysMode[btj.sysState.mode]}
          ${btj.sysState?.scanning ? 'SCANNING' : ''}
        </li>
      </ul>
    `;
  }


  private getNavState() {
    const isDevices = this.isCurrentPath('/') || this.isCurrentPath('/devices');
    const isProfile = (id: number) => this.isCurrentPath(`/profiles/${id}`);
    const profileIds = Array.from(btj.profiles.keys());
    const hasProfiles = btj.connected && profileIds.length > 0;

    return { isDevices, isProfile, profileIds, hasProfiles };
  }

  private renderTopbarMenu() {
    const { isDevices, isProfile, profileIds, hasProfiles } = this.getNavState();
    return html`
      <ul class="nav nav-tabs">

        <li class="nav-item ${btj.connected ? '' : 'd-none'}">
          <a class="nav-link ${isDevices ? 'active' : ''}"
            aria-current=${isDevices ? 'page' : undefined}
            href="${this.buildPath('/devices')}"
          >
            Devices
          </a>
        </li>

        <li class="nav-item dropdown ${hasProfiles ? '' : 'd-none'}">
          <a class="nav-link dropdown-toggle ${profileIds.some(id => isProfile(id)) ? 'active' : ''}"
            href="#" role="button"
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            Profiles
          </a>
          <ul class="dropdown-menu">
            ${profileIds.map(id => html`
              <li>
                <a class="dropdown-item ${isProfile(id) ? 'active' : ''}"
                  href="${this.buildPath(`/profiles/${id}`)}"
                >
                  Profile ${id}
                </a>
              </li>
            `)}
          </ul>
        </li>

      </ul>

      ${btj.connected ? html`
        <button
          class="btn btn-outline-secondary ms-3"
          @click=${this.disconnect}
        >
          Disconnect
        </button>
      ` : html`
        <span class="navbar-text ms-3">NOT CONNECTED</span>
      `}
    `;
  }

  private renderSidebarMenu() {
    const { isDevices, isProfile, profileIds, hasProfiles } = this.getNavState();
    return html`
      <nav class="nav nav-pills flex-column gap-1">
        <a
          class="nav-link ${btj.connected ? '' : 'disabled'} ${isDevices ? 'active' : ''}"
          data-bs-dismiss="offcanvas"
          @click=${() => this.onNavLinkClick(this.buildPath('/devices'))}
        >
          Devices
        </a>

        ${hasProfiles ? html`
          <div class="mt-2 text-muted">Profiles</div>
          ${profileIds.map(id => html`
            <a
              class="nav-link ${isProfile(id) ? 'active' : ''}"
              data-bs-dismiss="offcanvas"
              @click=${() => this.onNavLinkClick(this.buildPath(`/profiles/${id}`))}
            >
              Profile ${id}
            </a>
          `)}
        ` : null}

        <div class="mt-3">
          <button
            class="btn btn-outline-secondary w-100"
            data-bs-dismiss="offcanvas"
            @click=${this.disconnect}
          >
            Disconnect
          </button>
        </div>
      </nav>
    `;
  }

  private renderNavbar() {
    return html`
      <nav class="navbar navbar-expand-lg sticky-top bg-body-tertiary">
        <div class="container-fluid">
          <a class="navbar-brand d-flex gap-2" href="${this.buildPath('/')}">
            <span>🕹️</span>
            <span>Blue2Joy</span>
          </a>

          <div class="d-none d-lg-flex w-100">
            <div class="d-flex gap-3">
              ${this.renderTopbarInfo()}
            </div>
            <div class="d-flex ms-auto gap-3">
              ${this.renderTopbarMenu()}
            </div>
          </div>

          ${btj.connected ? html`
            <a
              class="navbar-toggler d-lg-none"
              type="button" data-bs-toggle="offcanvas"
              data-bs-target="#appNavOffcanvas"
              aria-controls="appNavOffcanvas"
              aria-expanded="false"
              aria-label="Toggle navigation"
            >
              <span class="navbar-toggler-icon"></span>
            </a>

            <div
              class="offcanvas offcanvas-end d-lg-none"
              tabindex="-1"
              id="appNavOffcanvas"
              aria-labelledby="appNavOffcanvasLabel"
            >
              <div class="offcanvas-header">
                ${this.renderSidebarInfo()}
                <button
                  type="button"
                  class="btn-close"
                  data-bs-dismiss="offcanvas"
                  aria-label="Close">
                </button>
              </div>

              <div class="offcanvas-body">
                ${this.renderSidebarMenu()}
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
          ${btj.connected ? this.renderRoute() : this.renderNotConnected()}
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
