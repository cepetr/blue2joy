import { MobxLitElement } from "@adobe/lit-mobx";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { autorun, IReactionDisposer } from "mobx";
import { btj } from "../models/btj-model.js";
import { Btj } from "../services/btj-messages.js";
import { picoSheet } from '../styles/pico.js';


import "./pin-editor.js";
import "./pot-editor.js";

@customElement("profiles-view")
export class ProfilesView extends MobxLitElement {
  static override styles = [picoSheet]

  @property({ type: Number })
  profileId: number = 0;

  // Collected edits from child editors. Keyed by type+id.
  private _edits: { pins?: Map<number, Btj.PinConfig>, pots?: Map<number, Btj.PotConfig> } = {};

  private _disposer: IReactionDisposer | null = null;

  private async saveEditsForSelected() {
    try {
      await btj.saveProfileEdits(this.profileId, this._edits);
      this._edits = {};
    } catch (err: any) {
      globalThis.console.error('Failed to save edits', err);
    }
  }

  private resetEdits() {
    this._edits = {};
  }

  private onEditorEdit(e: CustomEvent) {
    const d = e.detail as { type: string, id: number, config: any };
    if (d.type === 'pin') {
      if (!this._edits.pins) this._edits.pins = new Map();
      this._edits.pins.set(d.id, d.config as Btj.PinConfig);
    } else if (d.type === 'pot') {
      if (!this._edits.pots) this._edits.pots = new Map();
      this._edits.pots.set(d.id, d.config as Btj.PotConfig);
    }
  }

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
      <h2>Profile ${this.profileId}</h2>
      <div class="container-fluid">
        <div>
          ${!profile ? html`<p>Loading…</p>` : html`
              <form @edit=${(e: Event) => this.onEditorEdit(e as CustomEvent)}>
                ${Array.from(profile.pins.entries()).map(([pid, cfg]) => html`
                  <pin-editor .profileId=${this.profileId} .pinId=${pid} .config=${cfg}></pin-editor>
                  `)}

                ${Array.from(profile.pots.entries()).map(([pid, cfg]) => html`
                  <pot-editor .profileId=${this.profileId} .potId=${pid} .config=${cfg}></pot-editor>
                  `)}

                <div class="row">
                  <button type="button" class="button" @click=${() => this.saveEditsForSelected()}>Save</button>
                  <button type="button" class="button secondary" @click=${() => this.resetEdits()}>Reset</button>
                </div>
              </form>
            `}
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
