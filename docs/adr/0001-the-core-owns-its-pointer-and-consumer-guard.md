---
status: accepted
---

# The wiki core owns its shipped pointer and consumer guard

A consumer wiki gets the wiki skill the way it gets the kernel's skills: the
full skill ships inside the installed package at the core pin, and a thin
pointer skill in the consumer's skill folder points at it. Unlike the kernel,
the wiki core does not rely on the template to write, check or move that
pointer. It ships the pointer itself (the shipped pointer), a consumer copies
it byte for byte (the installed pointer), and the core exports a consumer
guard that a consumer runs in its own check. The guard reports an install
finding when the installed pointer differs from the shipped one, the full
skill is missing, the core pin, lockfile and installed package disagree, or a
nested kernel is present.

## Considered options

- **The kernel's pointer format.** Its pointer carries a `Full skill:` line
  and a `Pinned commit:` line. Tried in a throwaway generated repository: the
  template's pointer test, which every generated repository carries, treats
  any skill with a `Full skill:` line as a kernel pointer and failed it twice
  (wrong commit, path outside the installed kernel). The template's
  `pin move` then refused the repository's next kernel Pin move, because its
  check went red.
- **Teach the template a second pinned package.** Bootstrap would install the
  wiki pointer and `pin move` would move the core pin. Right in the long run,
  but it changes the template for every generated repository before a second
  consumer wiki exists to prove the need.
- **No pointer, only an instructions line.** Cheapest, but nothing would
  notice a stale or hand-edited guide, which is the failure that started this
  work.

## Consequences

- The installed pointer names the full skill in prose and carries no
  `Full skill:` or `Pinned commit:` line, so the template's pointer test and
  `pin move` leave it alone, and a core pin move has nothing to rewrite in it.
- Until the template learns a second pinned package, a consumer wiki moves
  its kernel Pin and its core pin by hand, together, in one change. The
  template's `pin move` would install a nested kernel under the core, and the
  consumer guard would refuse it.
- Revisit when a second consumer wiki has needed the pointer copied by hand.
  Then the template owns installing it, and this decision is superseded.
