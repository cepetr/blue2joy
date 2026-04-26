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
import { Btj } from "../services/btj-messages.js";
import "../styles/bootstrap";
import { toggleTheme, currentTheme, type Theme } from "../styles/bootstrap.js";

import "./devices-view.js";
import "./profiles-view.js";
import "./xep80-view.js";

@customElement("app-root")
export class AppRoot extends MobxLitElement {
  protected override createRenderRoot() {
    return this;
  }

  @state() private busyAction: "bluetooth" | "usb" | "demo" | null = null;
  @state() private currentHash = location.hash.slice(1) || "/";
  @state() private theme: Theme = currentTheme();

  private buildPath(path: string): string {
    return `#${path}`;
  }

  private isCurrentPath(path: string): boolean {
    return this.currentHash === path || this.currentHash.startsWith(path + "/");
  }

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
  };

  private handleThemeChange = () => {
    this.theme = currentTheme();
  };

  private onThemeToggle = () => {
    toggleTheme();
  };

  private renderRoute() {
    const hash = this.currentHash;

    const profileMatch = hash.match(/^\/profiles\/(\d+)$/);
    if (profileMatch) {
      const profileId = parseInt(profileMatch[1], 10);
      return html`<profiles-view .profileId=${profileId}></profiles-view>`;
    }

    if (hash === "/xep80") {
      return html`<xep80-view></xep80-view>`;
    }

    return html`<devices-view></devices-view>`;
  }

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

  private disconnect = () => {
    btj.disconnect();
  };

  private onDisableXep80 = async () => {
    await btj.setJoyPortMode(Btj.JoyPortMode.NORMAL);
  };

  private onNavLinkClick = (path: string) => {
    window.location.hash = path;
  };

  private renderNotConnected() {
    const busy = this.busyAction !== null;

    return html`
      <div class="text-center pt-4">
        <h3>No device is connected.</h3>
        <p>Choose a transport to connect to hardware or open the demo mode.</p>

        <div class="d-grid gap-2 mx-auto" style="width: min(100%, 12rem);">
          <button
            class="btn btn-primary"
            @click=${this.onScanClick}
            ?disabled=${busy}
          >
            ${this.busyAction === "bluetooth"
              ? "Opening Bluetooth chooser..."
              : "Connect with Bluetooth"}
          </button>

          <button
            class="btn btn-outline-primary"
            @click=${this.onUsbClick}
            ?disabled=${busy}
          >
            ${this.busyAction === "usb"
              ? "Opening USB chooser..."
              : "Connect with USB"}
          </button>

          <button
            class="btn btn-outline-secondary"
            @click=${this.onDemoClick}
            ?disabled=${busy}
          >
            ${this.busyAction === "demo"
              ? "Starting demo mode…"
              : "Open Demo Mode"}
          </button>
        </div>

        <p class="text-body-secondary mt-3 mb-0">
          Demo mode uses the virtual transport for UI testing and presentations.
        </p>

        ${this.renderErrors()}
      </div>
    `;
  }

  private renderErrors() {
    if (btj.errors.length === 0) return null;
    return html`
      <div class="mt-3">
        ${btj.errors.map(
          (err) => html`
            <div
              class="alert alert-danger alert-dismissible fade show"
              role="alert"
            >
              <strong> ${err.source ? `${err.source}: ` : ""} </strong>

              ${err.message}

              <button
                type="button"
                class="btn-close"
                @click=${() => btj.removeError(err.id)}
                aria-label="Close"
              ></button>
            </div>
          `,
        )}
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

      <span class="navbar-text"> ${Btj.SysMode[btj.sysState.mode]} </span>

      <span class="navbar-text">
        ${btj.sysState?.scanning ? "SCANNING" : ""}
      </span>
    `;
  }

  private renderSidebarInfo() {
    if (!btj.sysInfo || !btj.sysState) return null;
    return html`
      <ul class="list-unstyled mb-0">
        <li>
          <strong>Device:</strong>
          ${btj.sysInfo.hw_id}
        </li>
        <li>
          <strong>Firmware:</strong>
          ${btj.sysInfo.sw_version}
        </li>
        <li>
          <strong>Current Mode:</strong>
          ${Btj.SysMode[btj.sysState.mode]}
          ${btj.sysState?.scanning ? "SCANNING" : ""}
        </li>
      </ul>
    `;
  }

  private getNavState() {
    const isDevices = this.isCurrentPath("/") || this.isCurrentPath("/devices");
    const isProfile = (id: number) => this.isCurrentPath(`/profiles/${id}`);
    const isXep80 = this.isCurrentPath("/xep80");
    const profileIds = Array.from(btj.profiles.keys());
    const hasProfiles = btj.connected && profileIds.length > 0;

    return { isDevices, isProfile, isXep80, profileIds, hasProfiles };
  }

  private renderTopbarMenu() {
    const { isDevices, isProfile, isXep80, profileIds, hasProfiles } =
      this.getNavState();
    return html`
      <ul class="nav nav-tabs">
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
            href="#"
            role="button"
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            Profiles
          </a>
          <ul class="dropdown-menu">
            ${profileIds.map(
              (id) => html`
                <li>
                  <a
                    class="dropdown-item ${isProfile(id) ? "active" : ""}"
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

      ${btj.connected && btj.joyPort?.mode === Btj.JoyPortMode.UART
        ? html`
            <button
              class="btn btn-outline-danger ms-3"
              @click=${this.onDisableXep80}
            >
              Disable XEP80
            </button>
          `
        : ""}
      ${btj.connected
        ? html`
            <button
              class="btn btn-outline-secondary ms-3"
              @click=${this.disconnect}
            >
              Disconnect
            </button>
          `
        : html` <span class="navbar-text ms-3">NOT CONNECTED</span> `}

      <button
        class="btn btn-sm btn-link ms-2 p-1 navbar-theme-btn"
        @click=${this.onThemeToggle}
        title="Toggle theme"
        aria-label="Toggle theme"
      >
        <i class="bi ${this.theme === "dark" ? "bi-sun" : "bi-moon"} fs-5"></i>
      </button>
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

        <a
          class="nav-link ${btj.connected ? "" : "disabled"} ${isXep80
            ? "active"
            : ""}"
          data-bs-dismiss="offcanvas"
          @click=${() => this.onNavLinkClick(this.buildPath("/xep80"))}
        >
          XEP80
        </a>

        ${hasProfiles
          ? html`
              <div class="mt-2 text-muted">Profiles</div>
              ${profileIds.map(
                (id) => html`
                  <a
                    class="nav-link ${isProfile(id) ? "active" : ""}"
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
        ${btj.connected && btj.joyPort?.mode === Btj.JoyPortMode.UART
          ? html`
              <button
                class="btn btn-outline-danger w-100 mt-2"
                data-bs-dismiss="offcanvas"
                @click=${this.onDisableXep80}
              >
                Disable XEP80
              </button>
            `
          : ""}

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
      <nav class="navbar navbar-expand-lg fixed-top bg-body-tertiary">
        <div class="container-fluid">
          <a class="navbar-brand d-flex gap-2" href="${this.buildPath("/")}">
            <span>🕹️</span>
            <span>Blue2Joy</span>
          </a>

          <button
            class="btn btn-sm btn-link ms-auto me-2 d-lg-none p-1 navbar-theme-btn"
            @click=${this.onThemeToggle}
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            <i
              class="bi ${this.theme === "dark" ? "bi-sun" : "bi-moon"} fs-5"
            ></i>
          </button>

          <div class="d-none d-lg-flex w-100">
            <div class="d-flex gap-3">${this.renderTopbarInfo()}</div>
            <div class="d-flex ms-auto gap-3">${this.renderTopbarMenu()}</div>
          </div>

          ${btj.connected
            ? html`
                <a
                  class="navbar-toggler d-lg-none"
                  type="button"
                  data-bs-toggle="offcanvas"
                  data-bs-target="#appNavOffcanvas"
                  aria-controls="appNavOffcanvas"
                  aria-expanded="false"
                  aria-label="Toggle navigation"
                >
                  <span class="navbar-toggler-icon"></span>
                </a>
              `
            : null}
        </div>
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
        :root {
          --app-navbar-height: 72px;
        }
        .content-with-offset {
          padding-top: var(--app-navbar-height);
        }
      </style>

      ${this.renderNavbar()} ${this.renderOffcanvas()}

      <div class="container-fluid content-with-offset">
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
