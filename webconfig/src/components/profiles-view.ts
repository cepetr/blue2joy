import { MobxLitElement } from "@adobe/lit-mobx";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { autorun, IReactionDisposer } from "mobx";
import { btj } from "../models/btj-model.js";


import "./intg-editor.js";
import "./pin-editor.js";
import "./pot-editor.js";

@customElement("profiles-view")
export class ProfilesView extends MobxLitElement {
  protected override createRenderRoot() {
    return this;
  }

  @property({ type: Number })
  profileId: number = 0;

  private _disposer: IReactionDisposer | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    // autorun observes btj.profiles and triggers requestUpdate
    this._disposer = autorun(() => {
      // access profiles to create dependency
      void btj.profiles.size;
      this.requestUpdate();
    });
  }

  override disconnectedCallback(): void {
    if (this._disposer) this._disposer();
    super.disconnectedCallback();
  }

  override render() {
    const profile = btj.getProfile(this.profileId)!;

    return html`
      <h2 class="mb-4">Profile #${this.profileId}</h2>
      <div class="container-fluid">
        <div class="row">
          <div class="col-12">
            ${!profile ? html`
              <div class="spinner-border" role="status">
                <span class="sr-only"></span>
              </div>
              ` : html`
              <form>
                <div class="row g-3">
                  ${Array.from(profile.pins.entries()).map(([pid]) => html`
                    <div class="row mb-3 g-0">
                      <div class="col-12 g-0">
                        <pin-editor
                          .profileId=${this.profileId}
                          .pinId=${pid}
                          .pinState=${btj.ioPort?.pins[pid] ?? false}
                        >
                        </pin-editor>
                      </div>
                    </div>
                  `)}
                  ${Array.from(profile.pots.entries()).map(([pid]) => html`
                    <div class="row mb-3 g-0">
                      <div class="col-12 g-0">
                        <pot-editor
                          .profileId=${this.profileId}
                          .potId=${pid}
                          .potState=${btj.ioPort?.pots[pid] ?? 0}
                        >
                        </pot-editor>
                      </div>
                    </div>
                  `)}
                  ${Array.from(profile.intgs.entries()).map(([eid]) => html`
                    <div class="row mb-3 g-0">
                      <div class="col-12 g-0">
                        <intg-editor
                          .profileId=${this.profileId}
                          .intgId=${eid}
                        >
                        </intg-editor>
                      </div>
                    </div>
                  `)}
                </div>
              </form>
            `}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "profiles-view": ProfilesView;
  }
}
