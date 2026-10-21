export const iconOptions = [
  "folder", "folder-open", "graduation-cap", "archive", "beaker",
  "book-open", "briefcase", "building", "calendar", "chart-bar",
  "clipboard", "code", "file-text", "globe", "heart",
  "home", "inbox", "lightbulb", "map", "puzzle", "rocket", "tag", "star"
];

// A folder glyph reads as "this row is a folder" in the tree, so a note never offers one: a note with a folder
// icon looked like a folder that opens the wrong thing.
export const folderIcons = ["folder", "folder-open"];

export const noteIconOptions = iconOptions.filter((icon) => !folderIcons.includes(icon));
