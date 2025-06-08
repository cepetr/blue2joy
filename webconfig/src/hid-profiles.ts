import { MobxLitElement } from "@adobe/lit-mobx";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { autorun, IReactionDisposer } from "mobx";
import { Btj } from "./btj-messages.js";
import { btj } from "./btj-model.js";
import { picoSheet } from './styles/pico';


import "./pin-config-editor.js";
import "./pot-config-editor.js";

@customElement("hid-profiles")
export class HidProfiles extends MobxLitElement {
  static override styles = [picoSheet]

  @state()
  private selectedId: number | null = 0;

  // Collected edits from child editors. Keyed by type+id.
  private _edits: { pins?: Map<number, Btj.PinConfig>, pots?: Map<number, Btj.PotConfig> } = {};

  private _disposer: IReactionDisposer | null = null;

  private async selectProfile(id: number) {
    this.selectedId = id;
  }

  private async saveEditsForSelected() {
    const id = this.selectedId;
    if (id == null) return;
    try {
      await btj.saveProfileEdits(id, this._edits);
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
    const tabs = [0, 1, 2, 3, 4];
    const selected = this.selectedId;
    const profile = selected != null ? btj.getProfile(selected) : undefined;
    globalThis.console.log('render profiles, selected=', selected, 'profile=', profile);

    return html`
      <h2>HID Profiles</h2>
      <div class="container-fluid">
        <div>
          <nav>
            ${tabs.map(id => html
      `<button class="button" @click=${() => this.selectProfile(id)} ?disabled=${id === selected}>Profile ${id}</button>`)}
          </nav>
        </div>

        <div>
          ${selected == null ? html`
            <p>Select a profile to edit</p>` : html`
            <h3>Profile ${selected}</h3>
              ${!profile ? html`<p>Loading…</p>` : html`
              <form @edit=${(e: Event) => this.onEditorEdit(e as CustomEvent)}>
                ${Array.from(profile.pins.entries()).map(([pid, cfg]) => html`
                  <pin-config-editor .profileId=${selected} .pinId=${pid} .config=${cfg}></pin-config-editor>
                  `)}

                ${Array.from(profile.pots.entries()).map(([pid, cfg]) => html`
                  <pot-config-editor .profileId=${selected} .potId=${pid} .config=${cfg}></pot-config-editor>
                  `)}

                <div class="row">
                  <button type="button" class="button" @click=${() => this.saveEditsForSelected()}>Save</button>
                  <button type="button" class="button secondary" @click=${() => this.resetEdits()}>Reset</button>
                </div>
              </form>
            `}
          `}
          </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hid-profiles": HidProfiles;
  }
}
