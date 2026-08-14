/**
 * Theme-aware note color palette.
 *
 * Each theme gets 10 colors that contrast well in BOTH light and dark modes
 * of that theme (so the user picks a color once and it stays readable when
 * they switch modes). 2 grays + 8 accent colors covering red, orange, yellow,
 * green, aqua/teal, blue, darker blue, and purple.
 */

export const NOTE_COLORS = {
  gruvbox: [
    '#a89984', // gruvbox fg4 (gray)
    '#928374', // gruvbox gray
    '#fb4934', // red_bright
    '#fe8019', // orange_bright
    '#fabd2f', // yellow_bright
    '#b8bb26', // green_bright
    '#8ec07c', // aqua_bright
    '#83a598', // blue_bright
    '#458588', // blue_neutral
    '#d3869b', // purple_bright
  ],
  github: [
    '#656d76', // fg-muted
    '#8b949e', // fg-color-muted
    '#cf222e', // danger
    '#bc4c00', // severe
    '#9a6700', // attention
    '#1a7f37', // success
    '#1b7c83', // Primer data-cyan-emphasis
    '#0969da', // accent
    '#0a3069', // blue-8
    '#8250df', // done
  ],
  dracula: [
    '#6272a4', // Comment (gray)
    '#44475a', // Current Line (darker gray)
    '#ff5555', // Red
    '#ffb86c', // Orange
    '#f1fa8c', // Yellow
    '#50fa7b', // Green
    '#8be9fd', // Cyan
    '#bd93f9', // Purple
    '#ff79c6', // Pink
    '#f8f8f2', // Foreground (near-white)
  ],
  nord: [
    '#4c566a', // nord3
    '#7b88a1', // muted gray
    '#bf616a', // Aurora red
    '#d08770', // Aurora orange
    '#ebcb8b', // Aurora yellow
    '#a3be8c', // Aurora green
    '#8fbcbb', // Frost teal
    '#5e81ac', // Frost blue (light)
    '#81a1c1', // Frost blue (dark)
    '#b48ead', // Aurora purple
  ],
  solarized: [
    '#93a1a1', // base1
    '#657b83', // base00
    '#dc322f', // red
    '#cb4b16', // orange
    '#b58900', // yellow
    '#859900', // green
    '#2aa198', // cyan
    '#268bd2', // blue
    '#6c71c4', // violet
    '#d33682', // magenta
  ],
  catppuccin: [
    '#9399b2', // Subtext1
    '#6c7086', // Subtext0
    '#f38ba8', // Red
    '#fab387', // Peach
    '#f9e2af', // Yellow
    '#a6e3a1', // Green
    '#94e2d5', // Teal
    '#89b4fa', // Blue
    '#74c7ec', // Sapphire
    '#cba6f7', // Mauve
  ],
};

const DEFAULT_COLORS = NOTE_COLORS.gruvbox;

/**
 * Return the 10-color note palette for the given theme. Falls back to gruvbox
 * if the theme is unknown.
 *
 * @param {string} themeName
 * @returns {string[]} array of hex color codes
 */
export function getNoteColorOptions(themeName) {
  if (themeName && NOTE_COLORS[themeName]) return NOTE_COLORS[themeName];
  return DEFAULT_COLORS;
}
