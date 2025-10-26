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

import { action, computed, makeAutoObservable, observable, runInAction } from "mobx";
import { BtjConnection, scanAndSelect } from "../services/btj-connection";
import { Btj } from "../services/btj-messages";

export interface DeviceEntry {
  addr: Btj.DevAddr;
  config: Btj.DevConfig;
  state: Btj.DevState;
}

export interface ProfileEntry {
  pins: Map<number, Btj.PinConfig>;
  pots: Map<number, Btj.PotConfig>;
}

export class BtjModel {
  constructor() {
    // Make the instance observable so MobX tracks fields and methods
    // (works regardless of decorator transform settings).
    makeAutoObservable(this);
  }

  @observable
  conn: BtjConnection | null = null;

  @observable
  error: string | null = null;

  @observable
  sysInfo: Btj.SysInfo | null = null;

  @observable
  sysState: Btj.SysState | null = null;

  @observable
  devices: DeviceEntry[] = [];

  @observable
  advDevices: Btj.AdvData[] = [];

  @observable
  profiles: Map<number, ProfileEntry> = new Map();


  @computed
  get connected(): boolean {
    return this.conn != null;
  }

  @action
  async scanAndConnect(): Promise<void> {
    try {
      const device = await scanAndSelect();
      await this.connect(device);
    } catch (err: any) {
      if (err && err.name === 'NotFoundError') {
        // User canceled the chooser - not an error
        return;
      }
      this.error = err?.message ?? String(err);
    }
  }

  private processSysStateUpdateEvent(payload: DataView) {
    const evt = new Btj.SysStateUpdateEvent();
    evt.parseMessage(payload);
    runInAction(() => {
      this.sysState = evt.data;
    });
  }

  private processAdvListUpdateEvent(payload: DataView) {
    const evt = new Btj.AdvListUpdateEvent();
    evt.parseMessage(payload);
    runInAction(() => {
      if (!evt.deleted) {
        // New or updated entry
        const idx = this.advDevices.findIndex(dev => dev.addr.equals(evt.data.addr));
        if (idx >= 0) {
          // replace existing entry
          this.advDevices.splice(idx, 1, evt.data);
        } else {
          // append new entry
          this.advDevices.push(evt.data);
        }
      } else {
        // Entry removed
        this.advDevices = this.advDevices.filter(dev => !dev.addr.equals(evt.data.addr));
      }
    });
  }

  private processDevListUpdateEvent(payload: DataView) {
    const evt = new Btj.DevListUpdateEvent();
    evt.parseMessage(payload);
    runInAction(() => {
      if (!evt.deleted) {
        // New or updated entry
        const idx = this.devices.findIndex(dev => dev.addr.equals(evt.addr));
        const entry = { addr: evt.addr, config: evt.config!, state: evt.state! };
        if (idx >= 0) {
          // replace existing entry
          this.devices.splice(idx, 1, entry);

        } else {
          // append new entry
          this.devices.push(entry);
        }
      } else {
        // Entry removed
        this.devices = this.devices.filter(dev => !dev.addr.equals(evt.addr));
      }
    });
  }

  private processProfileUpdateEvent(payload: DataView) {
    const evt = new Btj.ProfileUpdateEvent();
    evt.parseMessage(payload);
    runInAction(() => {
      const entry: ProfileEntry = { pins: evt.pins, pots: evt.pots };
      this.profiles.set(evt.profile, entry);
    });
  }

  // Handler forwarded to BtjConnection to receive async events from the device
  private processEvent = (msgId: number, payload: DataView) => {
    try {
      switch (msgId) {
        case Btj.MsgId.EVT_SYS_STATE_UPDATE:
          this.processSysStateUpdateEvent(payload);
          break;
        case Btj.MsgId.EVT_ADV_LIST_UPDATE:
          this.processAdvListUpdateEvent(payload);
          break;
        case Btj.MsgId.EVT_DEV_LIST_UPDATE:
          this.processDevListUpdateEvent(payload);
          break;

        case Btj.MsgId.EVT_PROFILE_UPDATE:
          this.processProfileUpdateEvent(payload);
          break;
      }
    } catch (err) {
      console.error('Failed to handle event', err);
    }
  }

  @action
  async connect(device: BluetoothDevice): Promise<void> {
    this.removeAllDevices();
    this.removeAllProfiles();
    // create connection with event handler
    this.conn = new BtjConnection(device, this.processEvent);
    try {
      // Wait for the connection to be fully initialized
      await this.conn.connect();
      const info = (await this.conn.invoke(new Btj.GetSysInfo())).data;
      runInAction(() => {
        this.sysInfo = info;
      });
    } catch (err: any) {
      if (err instanceof Btj.Error) {
        this.error = `Device error: ${err.code}`;
      } else {
        this.error = err?.message ?? String(err);
      }
      this.disconnect();
    }
  }

  @action
  disconnect() {
    // Close underlying BLE connection if any
    if (this.conn) {
      // best-effort disconnect; do not await
      this.conn.disconnect().catch(() => { });
    }
    this.conn = null;
    this.sysInfo = null;
    this.sysState = null;
  }


  getProfile(id: number): ProfileEntry | undefined {
    return this.profiles.get(id);
  }

  @action
  removeAllProfiles() {
    this.profiles.clear();
  }

  @action
  removeAllDevices() {
    this.devices.splice(0, this.devices.length);
  }

  @action
  async setPinConfig(profileId: number, pinId: number, config: Btj.PinConfig) {
    if (!this.conn) throw new Error('Not connected');
    // Update local cache
    this.profiles.get(profileId)!.pins.set(pinId, config);
    // Send to device
    await this.conn.invoke(new Btj.SetPinConfig(profileId, pinId, config));
  }

  @action
  async setPotConfig(profileId: number, potId: number, config: Btj.PotConfig) {
    if (!this.conn) throw new Error('Not connected');
    // Update local cache
    this.profiles.get(profileId)!.pots.set(potId, config);
    // Send to device
    await this.conn.invoke(new Btj.SetPotConfig(profileId, potId, config));
  }

  @action
  async deleteDevice(addr: Btj.DevAddr): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    await this.conn.invoke(new Btj.DeleteDevice(addr));
  }

  @action
  async setDeviceProfile(addr: Btj.DevAddr, profile: number): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    await this.conn.invoke(new Btj.SetDevConfig(addr, { profile }));
  }
}

// Singleton instance for global use
export const btj = new BtjModel();
