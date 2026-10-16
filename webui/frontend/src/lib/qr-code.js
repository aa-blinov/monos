import qrcode from 'qrcode-generator';

/** Modules of empty margin around the code; scanners need four to find it. */
const QUIET_ZONE = 4;

/**
 * A QR code for `text` as one SVG path in a square of `size` modules, quiet zone included.
 * The code is made here, on this computer: the address with its access key never leaves it.
 * Error correction M survives a scratched or glossy screen without making the code dense.
 *
 * @param {string} text
 * @returns {{ size: number, path: string }}
 */
export function qrPath(text) {
  const code = qrcode(0, 'M');
  code.addData(String(text || ''), 'Byte');
  code.make();
  const count = code.getModuleCount();
  const parts = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (code.isDark(row, col)) parts.push(`M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
    }
  }
  return { size: count + QUIET_ZONE * 2, path: parts.join('') };
}
