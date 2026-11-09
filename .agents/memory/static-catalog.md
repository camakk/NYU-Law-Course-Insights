---
name: Static catalog hosting
description: The public evaluation catalog must preload its data and work without a backend.
---

Keep the public evaluation catalog usable as a purely static website. Preload
the complete evaluation snapshot with the initial application download; searches,
filters, rankings, expansions, and detail-page navigation must not depend on
runtime API or separate data-file requests.

**Why:** The user explicitly wants to self-host the site at another URL without
a backend, and to need no additional backend calls after the initial load.

**How to apply:** Preserve this requirement when adding catalog features.
Dataset updates can require rebuilding and redeploying the static snapshot.
Do not introduce server-dependent browsing or reactivate anonymous feedback
without an explicit request.
