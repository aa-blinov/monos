#!/usr/bin/env python3
"""
Setup script for zed-notes - works on Windows, macOS, and Linux.
Initializes development environment and installs pre-commit hooks.
"""

import subprocess
import sys
from pathlib import Path


def print_header(text: str) -> None:
    """Print a formatted header."""
    print(f"\n🔧 {text}")
    print("=" * 60)


def print_success(text: str) -> None:
    """Print a success message."""
    print(f"✅ {text}")


def print_error(text: str) -> None:
    """Print an error message."""
    print(f"❌ {text}")


def check_command_exists(cmd: str) -> bool:
    """Check if a command exists in PATH."""
    result = subprocess.run(
        ["where", cmd] if sys.platform == "win32" else ["which", cmd],
        capture_output=True,
    )
    return result.returncode == 0


def main() -> int:
    """Main setup function."""
    print_header("Initializing zed-notes environment")

    # Check for required tools
    print("\n📋 Checking for required tools...")

    if not check_command_exists("uv"):
        print_error("uv is not installed. Install it from https://docs.astral.sh/uv/getting-started/")
        return 1

    print_success("uv found")

    if not check_command_exists("git"):
        print_error("git is not installed")
        return 1

    print_success("git found")

    # Install dependencies
    print_header("Installing dependencies")
    print("   Running: uv sync")
    print("   (This may take a minute on first run...)")

    result = subprocess.run(["uv", "sync"])
    if result.returncode != 0:
        print_error("Failed to install dependencies")
        return 1

    print_success("Dependencies installed")

    # Install pre-commit
    print_header("Setting up pre-commit hooks")

    print("   Running: uv run pre-commit install")
    result = subprocess.run(["uv", "run", "pre-commit", "install"])

    if result.returncode != 0:
        print_error("Failed to initialize pre-commit hooks")
        return 1

    print_success("Pre-commit hooks installed")

    # Final message
    print_header("Setup complete!")
    print("\n📝 Ready to work! Available commands:")
    print("   uv run new_note.py       — create a new note")
    print("   uv run format_notes.py    — format all notes")
    print("   pre-commit run --all-files — check all files manually")
    print("\n💡 Next steps:")
    print("   1. Try creating a note: uv run new_note.py")
    print("   2. Or format existing notes: uv run format_notes.py")
    print("\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
