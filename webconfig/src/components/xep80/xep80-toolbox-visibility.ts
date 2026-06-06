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

export class Xep80ToolboxVisibilityController {
  static readonly hideDelayMs = 1800;

  private toolboxHideTimer?: number;

  constructor(private readonly onVisibilityChange: (visible: boolean) => void) { }

  onPointerEnter = () => {
    this.show();
  };

  onPointerMove = () => {
    this.show();
  };

  onPointerLeave = () => {
    this.hide();
  };

  onTouchStart = () => {
    this.show();
  };

  onFocusIn = (event: FocusEvent) => {
    this.show(!this.shouldKeepVisibleForFocus(event.target));
  };

  onFocusOut = () => {
    this.scheduleHide();
  };

  onFullscreenEntered(activeElement: Element | null) {
    this.show(!this.shouldKeepVisibleForFocus(activeElement));
  }

  hide() {
    this.clearHideTimer();
    this.onVisibilityChange(false);
  }

  dispose() {
    this.clearHideTimer();
  }

  private show(scheduleHide = true) {
    this.onVisibilityChange(true);

    if (scheduleHide) {
      this.scheduleHide();
    } else {
      this.clearHideTimer();
    }
  }

  private shouldKeepVisibleForFocus(target: EventTarget | null) {
    return target instanceof HTMLElement && target.matches(":focus-visible");
  }

  private clearHideTimer() {
    if (this.toolboxHideTimer !== undefined) {
      window.clearTimeout(this.toolboxHideTimer);
      this.toolboxHideTimer = undefined;
    }
  }

  private scheduleHide() {
    this.clearHideTimer();
    this.toolboxHideTimer = window.setTimeout(() => {
      this.onVisibilityChange(false);
      this.toolboxHideTimer = undefined;
    }, Xep80ToolboxVisibilityController.hideDelayMs);
  }
}
