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

import { action, computed, makeAutoObservable, observable } from "mobx";
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
  intgs: Map<number, Btj.IntgConfig>;
}

export interface ErrorEntry {
  id: number;
  message: string;
  source?: string;  // e.g., 'connection', 'device', 'profile'
}

export class BtjModel {
  private _errorIdCounter = 0;

  constructor() {
    // Make the instance observable so MobX tracks fields and methods
    // (works regardless of decorator transform settings).
    makeAutoObservable(this);
  }

  @observable
  conn: BtjConnection | null = null;

  @observable
  errors: ErrorEntry[] = [];

  @observable
  sysInfo: Btj.SysInfo | null = null;

  @observable
  sysState: Btj.SysState | null = null;

  @observable
  ioPort: Btj.IoPortState | null = null;

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

  private formatError(err: any): string {
    if (err instanceof Btj.Error) {
      return `Device error: ${err.code}`;
    }
    return err?.message ?? String(err);
  }

  @action
  logError(err: Error | string, source?: string): void {
    const error: ErrorEntry = {
      id: ++this._errorIdCounter,
      message: err instanceof Error ? this.formatError(err) : err,
      source,
    };
    this.errors.push(error);
  }

  @action
  clearErrors(): void {
    this.errors = [];
  }

  @action
  removeError(id: number): void {
    this.errors = this.errors.filter(e => e.id !== id);
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
      this.logError(err, 'connection');
    }
  }

  @action
  private processSysStateUpdateEvent(payload: DataView) {
    const evt = new Btj.SysStateUpdateEvent();
    evt.parseMessage(payload);
    this.sysState = evt.data;
  }

  @action
  private processAdvListUpdateEvent(payload: DataView) {
    const evt = new Btj.AdvListUpdateEvent();
    evt.parseMessage(payload);
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
  }

  @action
  private processDevListUpdateEvent(payload: DataView) {
    const evt = new Btj.DevListUpdateEvent();
    evt.parseMessage(payload);
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
  }

  @action
  private processProfileUpdateEvent(payload: DataView) {
    const evt = new Btj.ProfileUpdateEvent();
    evt.parseMessage(payload);
    const entry: ProfileEntry = { pins: evt.pins, pots: evt.pots, intgs: evt.intgs };
    this.profiles.set(evt.profile, entry);
  }

  @action
  private processIoPortUpdateEvent(payload: DataView) {
    const evt = new Btj.IoPortUpdateEvent();
    evt.parseMessage(payload);
    // Update ioPorts
    this.ioPort = evt.data;
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
        case Btj.MsgId.EVT_IO_PORT_UPDATE:
          this.processIoPortUpdateEvent(payload);
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

    device.addEventListener('gattserverdisconnected', () => {
      this.disconnect();
    });

    this.clearErrors();

    // create connection with event handler
    this.conn = new BtjConnection(device, this.processEvent);
    try {
      // Wait for the connection to be fully initialized
      await this.conn.connect();
      this.sysInfo = (await this.conn.invoke(new Btj.GetSysInfo())).data;
    } catch (err: any) {
      this.logError(err, 'connection');
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
    try {
      // Send to device
      await this.conn.invoke(new Btj.SetPinConfig(profileId, pinId, config));
    } catch (err: any) {
      this.logError(err, 'profile');
      // Revert local cache change on error
      const profile = this.profiles.get(profileId);
      if (profile) {
        profile.pins.delete(pinId);
      }
    }
  }

  @action
  async setPotConfig(profileId: number, potId: number, config: Btj.PotConfig) {
    if (!this.conn) throw new Error('Not connected');
    // Update local cache
    this.profiles.get(profileId)!.pots.set(potId, config);
    try {
      // Send to device
      await this.conn.invoke(new Btj.SetPotConfig(profileId, potId, config));
    } catch (err: any) {
      this.logError(err, 'profile');
      // Revert local cache change on error
      const profile = this.profiles.get(profileId);
      if (profile) {
        profile.pots.delete(potId);
      }
    }
  }

  @action
  async setIntgConfig(profileId: number, intgId: number, config: Btj.IntgConfig) {
    if (!this.conn) throw new Error('Not connected');
    // Update local cache
    this.profiles.get(profileId)!.intgs.set(intgId, config);
    try {
      // Send to device
      await this.conn.invoke(new Btj.SetIntgConfig(profileId, intgId, config));
    } catch (err: any) {
      this.logError(err, 'profile');
      // Revert local cache change on error
      const profile = this.profiles.get(profileId);
      if (profile) {
        profile.intgs.delete(intgId);
      }
    }
  }

  @action
  async deleteDevice(addr: Btj.DevAddr): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    try {
      await this.conn.invoke(new Btj.DeleteDevice(addr));
    } catch (err: any) {
      this.logError(err, 'device');
    }
  }

  @action
  async setDeviceProfile(addr: Btj.DevAddr, profile: number): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    try {
      await this.conn.invoke(new Btj.SetDevConfig(addr, { profile }));
    } catch (err: any) {
      this.logError(err, 'device');
    }
  }

  @action
  async startScanning(): Promise<void> {
    if (!this.conn) {
      this.logError('Not connected', 'connection');
      return;
    }
    try {
      await this.conn.invoke(new Btj.SetMode(Btj.SysMode.MANUAL, true));
      await this.conn.invoke(new Btj.StartScanning());
    } catch (err: any) {
      this.logError(err, 'device');
    }
  }

  @action
  async stopScanning(): Promise<void> {
    if (!this.conn) return;
    try {
      await this.conn.invoke(new Btj.StopScanning());
    } catch (err: any) {
      this.logError(err, 'device');
    }
  }

  @action
  async connectDevice(addr: Btj.DevAddr): Promise<void> {
    if (!this.conn) {
      this.logError('Not connected', 'connection');
      return;
    }
    try {
      await this.stopScanning();
      await this.conn.invoke(new Btj.ConnectDevice(addr));
    } catch (err: any) {
      this.logError(err, 'device');
    }
  }
}

// Singleton instance for global use
export const btj = new BtjModel();
