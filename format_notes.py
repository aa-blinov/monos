# /// script
# dependencies = [
#   "mdformat",
#   "mdformat-gfm",
#   "mdformat-frontmatter",
#   "mdformat-footnote",
# ]
# ///

import os
from pathlib import Path

import mdformat


def main():
    """
    Standardize Markdown files using mdformat API and show status for each file.
    """
    root_dir = Path(__file__).parent.absolute()

    print(f"🚀 Starting Markdown formatting in {root_dir}...")

    # Files/directories to exclude
    exclude_dirs = {".git", "assets", ".obsidian"}
    exclude_files = {"README.md", "Agents.md"}

    files_to_format = []

    for root, dirs, files in os.walk(root_dir):
        # Filter out excluded directories in-place
        dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith(".")]

        for file in files:
            if file.endswith(".md") and file not in exclude_files:
                files_to_format.append(Path(root) / file)

    if not files_to_format:
        print("✨ No files found to format.")
        return

    print(f"Found {len(files_to_format)} files. Checking status...\n")

    formatted_count = 0
    skipped_count = 0
    error_count = 0

    # Options for mdformat
    # wrap="no" disables line wrapping
    for file_path in sorted(files_to_format):
        relative_path = os.path.relpath(file_path, root_dir)

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                original_content = f.read()

            # Format the content using mdformat API
            formatted_content = mdformat.text(
                original_content,
                options={"wrap": "no"},
                extensions={"gfm", "frontmatter", "footnote"},
            )

            if original_content != formatted_content:
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(formatted_content)
                print(f"✅ FIXED:   {relative_path}")
                formatted_count += 1
            else:
                print(f"➖ OK:      {relative_path}")
                skipped_count += 1

        except Exception as e:
            print(f"❌ ERROR:   {relative_path} ({e})")
            error_count += 1

    print("\n--- Statistics ---")
    print(f"✅ Formatted: {formatted_count}")
    print(f"➖ Already OK: {skipped_count}")
    if error_count > 0:
        print(f"❌ Errors:     {error_count}")
    print("------------------")
    print("✨ Formatting session finished.")


if __name__ == "__main__":
    main()
