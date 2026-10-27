// The top bar of the window, drawn by the page.
//
// On macOS and Windows the system's own title bar is hidden and the page draws one strip across the
// top, the same height and colour on both: the person moves the window by that strip, and the app looks
// alike on either system. What stays native is the part the system does best: the traffic lights on
// macOS, the minimise, maximise and close buttons on Windows (the overlay, tinted to the theme).
// Linux keeps the frame its window manager draws: there is no common set of controls to match.

const TITLEBAR_HEIGHT = 40;
const TRAFFIC_LIGHT_SIZE = 14;
const FALLBACK_COLORS = { color: '#282828', symbolColor: '#ebdbb2' };

function hasCustomTitleBar(platform) {
  return platform === 'darwin' || platform === 'win32';
}

function isColor(value) {
  return typeof value === 'string' && value.length > 0 && value.length < 64 && !/[;{}<>]/.test(value);
}

/** Colours from the page, or the dark theme's when the page sent something that is not a colour. */
function overlayColors(colors) {
  return {
    color: isColor(colors?.color) ? colors.color : FALLBACK_COLORS.color,
    symbolColor: isColor(colors?.symbolColor) ? colors.symbolColor : FALLBACK_COLORS.symbolColor,
  };
}

/** The BrowserWindow options that hide the system bar, or nothing where the system bar stays. */
function titleBarOptions(platform, colors) {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hidden',
      // Vertically centred in the strip, 16px from the edge: the strip's own padding leaves room for them.
      trafficLightPosition: { x: 16, y: Math.round((TITLEBAR_HEIGHT - TRAFFIC_LIGHT_SIZE) / 2) },
    };
  }
  if (platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: { ...overlayColors(colors), height: TITLEBAR_HEIGHT },
    };
  }
  return {};
}

module.exports = { TITLEBAR_HEIGHT, hasCustomTitleBar, overlayColors, titleBarOptions };
