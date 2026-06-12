# Publishing a Public Monos Repository

The repository previously contained local note data. Removing files from the latest commit is not enough: Git history can still contain old blobs.

Use one of the safe publishing paths below before making any repository public.

## Recommended: Publish a Clean Repository

Create a new repository from the cleaned working tree and push that repository publicly.

Why this is recommended:

- no old Git objects are carried over
- no force-push to a shared default branch
- the private repository can remain as an archive
- the public repository starts with a clean first commit

High-level steps:

1. Keep personal notes in the desktop data directory.
2. Make sure `notes/` is absent from the source repository.
3. Create a fresh repository from the cleaned tree.
4. Push the fresh repository to a new GitHub repository.
5. Make the new repository public.

This repository includes a helper for step 3:

```bash
npm run public:snapshot
```

By default it creates `../monos-public-snapshot`, initializes a new Git repository there, and stages the cleaned source tree.

## Alternative: Rewrite Private History

If you must keep the same GitHub repository URL, history must be rewritten to remove `notes/` from every commit.

This requires a force-push to the default branch. Treat it as destructive:

- coordinate with every collaborator
- keep a private backup
- verify the rewritten history before changing visibility
- rotate any secrets that may have been committed

This project does not automate force-pushing to `master`.

## Verification Checklist

Before making a repository public:

- `notes/` is ignored by `.gitignore`
- top-level `assets/` is ignored by `.gitignore`
- `notes/` is not present in the current tree
- top-level `assets/` is not present in the current tree
- generated `release/` artifacts are not committed
- README and docs contain no personal note content
- CI builds pass
- GitHub Pages is enabled after the repository is public
- the manual `GitHub Pages` workflow deploys from `site/`

You can check whether the current branch contains tracked notes:

```bash
git ls-files notes
```

The command should print nothing.
