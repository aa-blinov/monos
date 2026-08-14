import { writable } from 'svelte/store';

const SIDEBAR_WIDTH_KEY = 'sidebarWidth';
const SIDEBAR_DEFAULT_WIDTH = 336;
const SIDEBAR_LAPTOP_WIDTH = 280;
const SIDEBAR_COMPACT_WIDTH = 304;
const SIDEBAR_MIN_WIDTH = 256;
const SIDEBAR_MAX_WIDTH = 420;
const MOBILE_BREAKPOINT = 1024;

function viewportMaxSidebarWidth() {
  if (typeof window === 'undefined') return SIDEBAR_MAX_WIDTH;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - 96));
}

export function defaultSidebarWidth() {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH;
  const width = window.innerWidth;
  if (width < 1200) return SIDEBAR_LAPTOP_WIDTH;
  if (width < 1400) return SIDEBAR_COMPACT_WIDTH;
  return SIDEBAR_DEFAULT_WIDTH;
}

export function clampSidebarWidth(value) {
  const numericValue = Number(value) || defaultSidebarWidth();
  return Math.min(viewportMaxSidebarWidth(), Math.max(SIDEBAR_MIN_WIDTH, numericValue));
}

export function getInitialSidebarWidth() {
  if (typeof localStorage === 'undefined') return defaultSidebarWidth();
  return clampSidebarWidth(localStorage.getItem(SIDEBAR_WIDTH_KEY));
}

export function saveSidebarWidth(width) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(width)));
}

export const sidebarOpen = writable(true);
export const sidebarWidth = writable(getInitialSidebarWidth());
export const isResizingSidebar = writable(false);

export function toggleSidebar() {
  sidebarOpen.update((open) => !open);
}

export function setSidebarOpen(value) {
  sidebarOpen.set(Boolean(value));
}

export function setSidebarWidth(width) {
  const clamped = clampSidebarWidth(width);
  sidebarWidth.set(clamped);
  saveSidebarWidth(clamped);
}

export const SIDEBAR_CONSTANTS = {
  WIDTH_KEY: SIDEBAR_WIDTH_KEY,
  DEFAULT_WIDTH: SIDEBAR_DEFAULT_WIDTH,
  LAPTOP_WIDTH: SIDEBAR_LAPTOP_WIDTH,
  COMPACT_WIDTH: SIDEBAR_COMPACT_WIDTH,
  MIN_WIDTH: SIDEBAR_MIN_WIDTH,
  MAX_WIDTH: SIDEBAR_MAX_WIDTH,
  MOBILE_BREAKPOINT,
};
