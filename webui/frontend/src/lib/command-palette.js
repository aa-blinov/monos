import { writable } from 'svelte/store';

export const commandPaletteOpen = writable(false);
export const commandPaletteMode = writable('commands');

export function openCommandPalette(mode = 'commands') {
  commandPaletteMode.set(mode);
  commandPaletteOpen.set(true);
}

export function closeCommandPalette() {
  commandPaletteOpen.set(false);
}
