// Key definitions for Input.dispatchKeyEvent.
import type { CDPSession } from './connection.ts';

const K: Record<string, [number, string, string?]> = {
  Enter: [13, 'Enter', '\r'],
  Tab: [9, 'Tab'],
  Escape: [27, 'Escape'],
  Backspace: [8, 'Backspace'],
  Delete: [46, 'Delete'],
  ArrowUp: [38, 'ArrowUp'],
  ArrowDown: [40, 'ArrowDown'],
  ArrowLeft: [37, 'ArrowLeft'],
  ArrowRight: [39, 'ArrowRight'],
  Home: [36, 'Home'],
  End: [35, 'End'],
  PageUp: [33, 'PageUp'],
  PageDown: [34, 'PageDown'],
  Space: [32, 'Space', ' '],
  Insert: [45, 'Insert'],
  F1: [112, 'F1'],
  F2: [113, 'F2'],
  F3: [114, 'F3'],
  F4: [115, 'F4'],
  F5: [116, 'F5'],
  F12: [123, 'F12'],
};
const ALIAS: Record<string, string> = {
  Esc: 'Escape',
  Return: 'Enter',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Del: 'Delete',
  ' ': 'Space',
};
const MODS: Record<string, number> = { Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Cmd: 4, Command: 4, Shift: 8 };
const MOD_KEYS: Record<number, [string, number]> = { 1: ['Alt', 18], 2: ['Control', 17], 4: ['Meta', 91], 8: ['Shift', 16] };

/** Parse "Control+Shift+a" -> {modifiers, key, code, keyCode, text} */
export function parseKey(combo: string) {
  const parts = combo === '+' ? ['+'] : combo.split('+').filter(Boolean);
  let modifiers = 0;
  const keyName = parts.pop() ?? '';
  for (const p of parts) {
    const m = MODS[p] ?? MODS[p[0].toUpperCase() + p.slice(1).toLowerCase()];
    if (!m) throw new Error(`unknown modifier ${p}`);
    modifiers |= m;
  }
  const name = ALIAS[keyName] || keyName;
  if (K[name]) {
    const [keyCode, code, text] = K[name];
    return { modifiers, key: name === 'Space' ? ' ' : name, code, keyCode, text: modifiers & ~8 ? undefined : text };
  }
  if (name.length === 1) {
    const upper = name.toUpperCase();
    const isLetter = /[A-Z]/.test(upper);
    const isDigit = /[0-9]/.test(name);
    return {
      modifiers,
      key: name,
      keyCode: upper.charCodeAt(0),
      code: isLetter ? `Key${upper}` : isDigit ? `Digit${name}` : undefined,
      text: modifiers & ~8 ? undefined : name,
    };
  }
  throw new Error(`unknown key ${keyName}`);
}

export async function pressKey(session: CDPSession, combo: string) {
  const k = parseKey(combo);
  const mods = [1, 2, 4, 8].filter((m) => k.modifiers & m);
  let active = 0;
  for (const m of mods) {
    active |= m;
    const [key, kc] = MOD_KEYS[m];
    await session.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: active, key, code: key + 'Left', windowsVirtualKeyCode: kc });
  }
  const base = { modifiers: k.modifiers, key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode };
  // macOS: editing shortcuts need explicit commands
  const commands: string[] = [];
  if (process.platform === 'darwin' && k.modifiers & 4 && !(k.modifiers & 3)) {
    const map: Record<string, string> = { a: 'selectAll', c: 'copy', v: 'paste', x: 'cut', z: 'undo' };
    if (map[k.key.toLowerCase()]) commands.push(map[k.key.toLowerCase()]);
  }
  await session.send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...base, text: k.text, unmodifiedText: k.text, commands });
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  for (const m of mods.reverse()) {
    active &= ~m;
    const [key, kc] = MOD_KEYS[m];
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: active, key, code: key + 'Left', windowsVirtualKeyCode: kc });
  }
}
