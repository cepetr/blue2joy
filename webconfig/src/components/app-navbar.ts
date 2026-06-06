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
import { html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { btj } from "../models/btj-model.js";
import { Btj } from "../services/btj-messages.js";
import { currentTheme, toggleTheme, type Theme } from "../styles/bootstrap.js";

@customElement("app-navbar")
export class AppNavbar extends MobxLitElement {
  protected override createRenderRoot() {
    return this;
  }

  @state() private currentHash = location.hash.slice(1) || "/";
  @state() private theme: Theme = currentTheme();
  @state() private lastProfileId: number | null = null;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("hashchange", this.handleHashChange);
    window.addEventListener("themechange", this.handleThemeChange);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.handleHashChange);
    window.removeEventListener("themechange", this.handleThemeChange);
  }

  private handleHashChange = () => {
    this.currentHash = location.hash.slice(1) || "/";
    const profileMatch = this.currentHash.match(/^\/profiles\/(\d+)$/);
    if (profileMatch) {
      this.lastProfileId = parseInt(profileMatch[1], 10);
    }
  };

  private handleThemeChange = () => {
    this.theme = currentTheme();
  };

  private buildPath(path: string): string {
    return `#${path}`;
  }

  private isCurrentPath(path: string): boolean {
    return this.currentHash === path || this.currentHash.startsWith(path + "/");
  }

  private getNavState() {
    const isDevices = this.isCurrentPath("/") || this.isCurrentPath("/devices");
    const isProfile = (id: number) => this.isCurrentPath(`/profiles/${id}`);
    const isXep80 = this.isCurrentPath("/xep80");
    const profileIds = Array.from(btj.profiles.keys());
    const hasProfiles = btj.connected && profileIds.length > 0;

    return { isDevices, isProfile, isXep80, profileIds, hasProfiles };
  }

  private onThemeToggle = () => {
    toggleTheme();
  };

  private disconnect = () => {
    btj.disconnect();
  };

  private onDisableXep80 = async () => {
    await btj.setJoyPortMode(Btj.JoyPortMode.NORMAL);
  };

  private onNavLinkClick = (path: string) => {
    window.location.hash = path;
  };

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

      <span class="navbar-text"> ${Btj.SysMode[btj.sysState.mode]} </span>

      <span class="navbar-text">
        ${btj.sysState?.scanning ? "SCANNING" : ""}
      </span>
    `;
  }

  private renderActionButtons() {
    return html`
      <button
        class="btn btn-sm btn-link p-1 navbar-theme-btn"
        @click=${this.onThemeToggle}
        title="Toggle theme"
        aria-label="Toggle theme"
      >
        <i
          class="bi ${this.theme === "dark" ? "bi-sun" : "bi-moon"} fs-5"
        ></i>
      </button>

      ${btj.connected && btj.joyPort?.mode === Btj.JoyPortMode.UART
        ? html`
            <button
              class="btn btn-sm btn-link p-1 text-danger"
              @click=${this.onDisableXep80}
              title="Deactivate XEP80"
              aria-label="Deactivate XEP80"
            >
              <i class="bi bi-terminal-x fs-5"></i>
            </button>
          `
        : nothing}

      ${btj.connected
        ? html`
            <button
              class="btn btn-sm btn-link p-1"
              @click=${this.disconnect}
              title="Disconnect"
              aria-label="Disconnect"
            >
              <i class="bi bi-power fs-5"></i>
            </button>
          `
        : nothing}
    `;
  }

  private renderTopbarMenu() {
    const { isDevices, isProfile, isXep80, profileIds, hasProfiles } =
      this.getNavState();
    return html`
      <ul class="nav app-topbar-nav">
        <li class="nav-item ${btj.connected ? "" : "d-none"}">
          <a
            class="nav-link ${isDevices ? "active" : ""}"
            aria-current=${isDevices ? "page" : undefined}
            href="${this.buildPath("/devices")}"
          >
            Devices
          </a>
        </li>

        <li class="nav-item dropdown ${hasProfiles ? "" : "d-none"}">
          <a
            class="nav-link dropdown-toggle ${profileIds.some((id) =>
      isProfile(id),
    )
        ? "active"
        : ""}"
            href=${this.lastProfileId !== null
        ? this.buildPath(`/profiles/${this.lastProfileId}`)
        : nothing}
            role="button"
            aria-expanded="false"
          >
            Profiles
          </a>
          <ul class="dropdown-menu">
            ${profileIds.map(
          (id) => html`
                <li>
                  <a
                    class="dropdown-item ${isProfile(id) ? "active" : id === this.lastProfileId ? "app-last-visited" : ""}"
                    href="${this.buildPath(`/profiles/${id}`)}"
                  >
                    Profile ${id}
                  </a>
                </li>
              `,
        )}
          </ul>
        </li>

        <li class="nav-item ${btj.connected ? "" : "d-none"}">
          <a
            class="nav-link ${isXep80 ? "active" : ""}"
            aria-current=${isXep80 ? "page" : undefined}
            href="${this.buildPath("/xep80")}"
          >
            XEP80
          </a>
        </li>
      </ul>

      ${!btj.connected
        ? html`<span class="navbar-text">NOT CONNECTED</span>`
        : nothing}

      <div class="d-flex align-items-center gap-1">
        ${this.renderActionButtons()}
      </div>
    `;
  }

  private renderSidebarInfo() {
    if (!btj.sysInfo || !btj.sysState) return null;
    return html`
      <dl
        class="mb-0 small"
        style="display:grid; grid-template-columns:auto 1fr; column-gap:0.75rem;"
      >
        <dt class="fw-normal text-muted">Device</dt>
        <dd class="mb-0">${btj.sysInfo.hw_id}</dd>

        <dt class="fw-normal text-muted">Firmware</dt>
        <dd class="mb-0">${btj.sysInfo.sw_version}</dd>

        <dt class="fw-normal text-muted">Mode</dt>
        <dd class="mb-0">
          ${Btj.SysMode[btj.sysState.mode]}
          ${btj.sysState?.scanning ? "SCANNING" : ""}
        </dd>
      </dl>
    `;
  }

  private renderSidebarMenu() {
    const { isDevices, isProfile, isXep80, profileIds, hasProfiles } =
      this.getNavState();
    return html`
      <nav class="nav nav-pills flex-column gap-1">
        <a
          class="nav-link ${btj.connected ? "" : "disabled"} ${isDevices
        ? "active"
        : ""}"
          data-bs-dismiss="offcanvas"
          @click=${() => this.onNavLinkClick(this.buildPath("/devices"))}
        >
          Devices
        </a>

        ${hasProfiles
        ? html`
              <div
                class="nav-link disabled small fw-semibold text-muted mt-1 py-1"
              >
                Profiles
              </div>
              ${profileIds.map(
          (id) => html`
                  <a
                    class="nav-link ps-5 ${isProfile(id) ? "active" : ""}"
                    data-bs-dismiss="offcanvas"
                    @click=${() =>
              this.onNavLinkClick(this.buildPath(`/profiles/${id}`))}
                  >
                    Profile ${id}
                  </a>
                `,
        )}
            `
        : null}

        <a
          class="nav-link ${btj.connected ? "" : "disabled"} ${isXep80
        ? "active"
        : ""}"
          data-bs-dismiss="offcanvas"
          @click=${() => this.onNavLinkClick(this.buildPath("/xep80"))}
        >
          XEP80
        </a>
      </nav>
    `;
  }

  private renderOffcanvas() {
    if (!btj.connected) return null;
    return html`
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
            aria-label="Close"
          ></button>
        </div>

        <div class="offcanvas-body">${this.renderSidebarMenu()}</div>
      </div>
    `;
  }

  override render() {
    return html`
      <style>
        .app-topbar-nav .nav-link {
          border-radius: 0.375rem;
          transition: background-color 0.15s ease;
        }
        .app-topbar-nav .nav-link.active {
          background-color: rgba(var(--bs-emphasis-color-rgb), 0.08);
          font-weight: 600;
        }
        .app-topbar-nav .nav-link:not(.active):hover {
          background-color: rgba(var(--bs-emphasis-color-rgb), 0.05);
        }
        .app-topbar-nav .dropdown:hover > .dropdown-menu {
          display: block;
          margin-top: 0;
        }
        .app-topbar-nav .dropdown-item.app-last-visited {
          background-color: rgba(var(--bs-emphasis-color-rgb), 0.05);
          font-weight: 500;
        }
      </style>

      <nav class="navbar navbar-expand-lg fixed-top bg-body-tertiary">
        <div class="container-fluid">
          <a class="navbar-brand d-flex gap-2" href="${this.buildPath("/")}">
            <span>🕹️</span>
            <span>Blue2Joy</span>
          </a>

          <div class="ms-auto d-flex align-items-center gap-1 d-lg-none">
            ${!btj.connected
        ? html`<span class="navbar-text">NOT CONNECTED</span>`
        : nothing}
            ${this.renderActionButtons()}
            ${btj.connected
        ? html`
                  <span class="vr mx-1"></span>
                  <button
                    class="btn btn-sm btn-link p-1"
                    type="button"
                    data-bs-toggle="offcanvas"
                    data-bs-target="#appNavOffcanvas"
                    aria-controls="appNavOffcanvas"
                    aria-expanded="false"
                    aria-label="Toggle navigation"
                  >
                    <i class="bi bi-list fs-5"></i>
                  </button>
                `
        : null}
          </div>

          <div class="d-none d-lg-flex w-100">
            <div class="d-flex gap-3">${this.renderTopbarInfo()}</div>
            <div class="d-flex ms-auto gap-3">${this.renderTopbarMenu()}</div>
          </div>
        </div>
      </nav>

      ${this.renderOffcanvas()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-navbar": AppNavbar;
  }
}
