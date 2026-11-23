import type { InputSnapshot, PlayerEmoteKind } from '../core/types';

/**
 * Modular input handler modeled after UE5 Enhanced Input action mapping.
 * Tracks both edge-triggered JumpPressed and continuous JumpHeld for variable jump polish,
 * plus dodge-roll (V), heavy cleave (R), mana sidearm (X), and social emotes (1-3).
 */
export class InputManager {
  private readonly element: HTMLElement;
  private readonly keys = new Set<string>();
  private crouchToggled = false;
  private jumpQueued = false;
  private interactQueued = false;
  private attackQueued = false;
  private heavyAttackQueued = false;
  private firearmQueued = false;
  private dodgeQueued = false;
  private emoteQueued: PlayerEmoteKind | null = null;
  private rightMouseHeld = false;
  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private isDraggingLook = false;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private _pointerLocked = false;
  private readonly onPointerLockChange?: (locked: boolean) => void;
  private readonly isDialogueOpen?: () => boolean;

  constructor(
    element: HTMLElement,
    onPointerLockChange?: (locked: boolean) => void,
    isDialogueOpen?: () => boolean
  ) {
    this.element = element;
    this.onPointerLockChange = onPointerLockChange;
    this.isDialogueOpen = isDialogueOpen;
    this.bind();
  }

  public get pointerLocked(): boolean {
    return this._pointerLocked;
  }

  public requestPointerLock(): void {
    try {
      if (document.pointerLockElement !== this.element && this.element.requestPointerLock) {
        const res = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {
            // Pointer lock may be unavailable in restricted iframes; drag-look fallback stays active.
          });
        }
      }
    } catch {
      // Fallback drag-look remains active.
    }
  }

  public sample(): InputSnapshot {
    const forward = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0)
      - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const right = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0)
      - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);

    const ctrlHeld = this.keys.has('ControlLeft') || this.keys.has('ControlRight');

    const snapshot: InputSnapshot = {
      moveForward: forward,
      moveRight: right,
      sprintHeld: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      crouchActive: ctrlHeld || this.crouchToggled,
      jumpPressed: this.jumpQueued,
      jumpHeld: this.keys.has('Space'),
      interactPressed: this.interactQueued,
      attackPressed: this.attackQueued,
      heavyAttackPressed: this.heavyAttackQueued,
      firearmPressed: this.firearmQueued,
      dodgePressed: this.dodgeQueued,
      emotePressed: this.emoteQueued,
      guardHeld: this.rightMouseHeld || this.keys.has('KeyQ'),
      lookDeltaX: this.lookDeltaX,
      lookDeltaY: this.lookDeltaY,
    };

    // Consume single-frame edge actions
    this.jumpQueued = false;
    this.interactQueued = false;
    this.attackQueued = false;
    this.heavyAttackQueued = false;
    this.firearmQueued = false;
    this.dodgeQueued = false;
    this.emoteQueued = null;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;

    return snapshot;
  }

  public clearAll(): void {
    this.keys.clear();
    this.jumpQueued = false;
    this.interactQueued = false;
    this.attackQueued = false;
    this.heavyAttackQueued = false;
    this.firearmQueued = false;
    this.dodgeQueued = false;
    this.emoteQueued = null;
    this.rightMouseHeld = false;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.isDraggingLook = false;
  }

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) {
        this.jumpQueued = true;
      }
    }

    if (e.code === 'KeyE' && !e.repeat) {
      this.interactQueued = true;
    }

    if (e.code === 'KeyF' && !e.repeat) {
      this.attackQueued = true;
    }

    if (e.code === 'KeyR' && !e.repeat) {
      this.heavyAttackQueued = true;
    }

    if (e.code === 'KeyX' && !e.repeat) {
      this.firearmQueued = true;
    }

    if ((e.code === 'KeyV' || e.code === 'AltLeft') && !e.repeat) {
      if (e.code === 'AltLeft') e.preventDefault();
      this.dodgeQueued = true;
    }

    if (!e.repeat && !(this.isDialogueOpen && this.isDialogueOpen())) {
      if (e.code === 'Digit1') this.emoteQueued = 'wave';
      else if (e.code === 'Digit2') this.emoteQueued = 'salute';
      else if (e.code === 'Digit3') this.emoteQueued = 'sit';
    }

    if (e.code === 'KeyC' && !e.repeat) {
      this.crouchToggled = !this.crouchToggled;
    }

    if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
      this.crouchToggled = false;
    }

    // Pressing Shift cleanly exits toggle-crouch so sprint transition is seamless
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) {
      this.crouchToggled = false;
    }

    this.keys.add(e.code);
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly handlePointerDown = (e: PointerEvent): void => {
    if (e.button === 0) {
      if (document.pointerLockElement === this.element) {
        this.attackQueued = true;
      } else {
        this.isDraggingLook = true;
        this.pointerDownX = e.clientX;
        this.pointerDownY = e.clientY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
      }
    } else if (e.button === 2) {
      this.rightMouseHeld = true;
      if (document.pointerLockElement !== this.element) {
        this.isDraggingLook = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
      }
    }
  };

  private readonly handlePointerUp = (e: PointerEvent): void => {
    if (e.button === 0) {
      if (
        this.isDraggingLook &&
        document.pointerLockElement !== this.element &&
        Math.hypot(e.clientX - this.pointerDownX, e.clientY - this.pointerDownY) < 5
      ) {
        this.attackQueued = true;
      }
      this.isDraggingLook = false;
    } else if (e.button === 2) {
      this.rightMouseHeld = false;
      this.isDraggingLook = false;
    }
  };

  private readonly handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private readonly handleMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement === this.element) {
      this.lookDeltaX += e.movementX;
      this.lookDeltaY += e.movementY;
    } else if (this.isDraggingLook) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.lookDeltaX += dx;
      this.lookDeltaY += dy;
    }
  };

  private readonly handlePointerLockChange = (): void => {
    this._pointerLocked = document.pointerLockElement === this.element;
    this.onPointerLockChange?.(this._pointerLocked);
  };

  private readonly handleBlur = (): void => {
    this.clearAll();
  };

  private bind(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    this.element.addEventListener('pointerdown', this.handlePointerDown);
    this.element.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('mousemove', this.handleMouseMove);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
  }
}
