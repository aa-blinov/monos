# Documentation

The documents for Monos, a desktop notes app that keeps every note as a
plain Markdown file on the computer of the person who wrote it.

| Document | What it covers |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The system, the two runtime modes, the storage layout, the theme system and the git sync. |
| [STATE.md](STATE.md) | Where the state lives, who owns it and how it flows. |
| [LIB.md](LIB.md) | Every pure helper in the frontend, grouped by what it does. |
| [FRONTMATTER.md](FRONTMATTER.md) | The metadata a note may carry at the top of its file. |
| [CONTRIBUTING.md](CONTRIBUTING.md) | The workflow and the conventions of a change. |
| [PUBLISHING.md](PUBLISHING.md) | How to make the repository public without leaking the notes. |
| [ACCESS.md](ACCESS.md) | How to open Monos from a phone or another computer. |
| [RELEASE-QA.md](RELEASE-QA.md) | The list of checks that has to pass before a release goes out. |
| [screenshots/README.md](screenshots/README.md) | The eight pictures of the interface and how each one was taken. |
| [index.html](index.html) | The landing page. |
| [../README.md](../README.md) | The front door: what it does and how to run it. |
| [../AGENTS.md](../AGENTS.md) | The commands, the layout of the tree, and the traps. |
| [../PRODUCT.md](../PRODUCT.md) | The product truth: the users, the constraints and the principles. |
| [../DESIGN.md](../DESIGN.md) | The visual system: the six palettes, the type scale and the components. |
| [../webui/README.md](../webui/README.md) | The internals of the web application. |

## Reading order

New here: [../README.md](../README.md), then
[ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.

Changing the code: [ARCHITECTURE.md](ARCHITECTURE.md), then
[../AGENTS.md](../AGENTS.md) for the traps. The traps cover the port of
the packaged app, the file being the truth and the index being a cache,
the trigram tokenizer, and the terminal staying out of the API.

Working on the interface: [../DESIGN.md](../DESIGN.md) holds the tokens,
and [LIB.md](LIB.md) lists the helpers the frontend has, so that a
function that already exists is found before it is written again.

Before a release: [RELEASE-QA.md](RELEASE-QA.md), then
[PUBLISHING.md](PUBLISHING.md) if the repository is going public.

## What is not here

There is no guide to the notes themselves. A note is Markdown, and
[FRONTMATTER.md](FRONTMATTER.md) says what may sit at the top of one.
