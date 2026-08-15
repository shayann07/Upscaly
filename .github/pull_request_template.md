## What does this change?

<!-- One or two sentences. What behaviour is different after this PR? -->

## Why?

<!-- The problem being solved. If it fixes an issue, write "Fixes #123".
     If it fixes a bug, describe what was going wrong and what it looked
     like from the user's side. -->

## How was it verified?

<!-- Tests are the default answer. If something could only be checked by
     running the app, say exactly what you did: which file, which model,
     which scale, which GPU. "Seems to work" is not verification. -->

## Checklist

- [ ] `npm run check:quality` passes (tsc, eslint, vitest, clippy, formatting)
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` passes
- [ ] If a Rust IPC type changed, I ran `npm run gen:types` and committed the result
- [ ] New behaviour has a test that fails without the change
- [ ] Comments explain *why*, not *what*

## Anything reviewers should look at closely?

<!-- Trade-offs you made, alternatives you rejected, parts you are unsure
     about. Saying "I wasn't sure about X" is genuinely useful here. -->

---

<sub>New here? Sidecar binaries are gitignored — see
[Building from source](../README.md#building-from-source) before your first build.</sub>
