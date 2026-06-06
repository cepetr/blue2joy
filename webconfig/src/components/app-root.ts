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
import "../styles/bootstrap";

import "./app-navbar.js";
import "./connect-view.js";
import "./devices-view.js";
import "./profiles-view.js";
import "./xep80/xep80-view.js";

@customElement("app-root")
export class AppRoot extends MobxLitElement {
  protected override createRenderRoot() {
    return this;
  }

  @state() private currentHash = location.hash.slice(1) || "/";

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("hashchange", this.handleHashChange);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.handleHashChange);
  }

  private handleHashChange = () => {
    this.currentHash = location.hash.slice(1) || "/";
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

      <app-navbar></app-navbar>

      <div class="container-fluid content-with-offset">
        <div class="row">
          ${btj.connected
            ? this.renderRoute()
            : html`<connect-view></connect-view>`}
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
