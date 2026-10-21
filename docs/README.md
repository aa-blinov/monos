# Documentation

The documents for Monos, a desktop notes app that keeps every note as a
plain Markdown file on the computer of the person who wrote it.

| Document | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | The shape of the code: the modules, the data flow and the boundaries. |
| [architecture.md](architecture.md) | The owner's long document: the two runtime modes, the storage layout, the theme system, the sync and the test strategy. |
| [STATE.md](STATE.md) | Where the state lives, who owns it and how it flows. |
| [LIB.md](LIB.md) | Every pure helper in the frontend, grouped by what it does. |
| [FRONTMATTER.md](FRONTMATTER.md) | The metadata a note may carry at the top of its file. |
| [CONTRIBUTING.md](CONTRIBUTING.md) | The workflow and the conventions of a change. |
| [PUBLISHING.md](PUBLISHING.md) | How to make the repository public without leaking the notes. |
| [ACCESS.md](ACCESS.md) | How to open Monos from a phone or another computer. |
| [RELEASE-QA.md](RELEASE-QA.md) | The list of checks that has to pass before a release goes out. |
| [screenshots/README.md](screenshots/README.md) | The eight pictures of the interface and how each one was taken. |
| [index.html](../site/index.html) | The landing page. |
| [../README.md](../README.md) | The front door: what it does and how to run it. |
| [../AGENTS.md](../AGENTS.md) | The commands, the layout of the tree, and the traps. |
| [../PRODUCT.md](../PRODUCT.md) | The product truth: the users, the constraints and the principles. |
| [../DESIGN.md](../DESIGN.md) | The visual system: the six palettes, the type scale and the components. |
| [../webui/README.md](../webui/README.md) | The internals of the web application. |

## Two documents about the architecture

The folder carries two of them, and the names differ only in the case.

[architecture.md](architecture.md) is the owner's. It is the long one, it
predates the rest of this folder, and `docs/docs-freshness.test.js` reads it
by that exact path and fails the build when it stops naming the systems it
has to name. It stays where it is, with its content.

[architecture.md](architecture.md) is the house record of the same code: the
modules, the data flow and the boundaries, in the shape of the "How it
works" section of the README. It is the shorter one.

Read [architecture.md](architecture.md) first if you want the shape of the
code, and [architecture.md](architecture.md) afterwards for the detail of any
one part of it.

## Reading order

New here: [../README.md](../README.md), then
[architecture.md](architecture.md) for how the pieces fit together.

Changing the code: [architecture.md](architecture.md), then
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
