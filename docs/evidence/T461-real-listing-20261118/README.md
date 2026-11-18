# A real published preset through the discovery route (board T461)

2026-11-18 16:12 UTC (11:12 EST). Receiver: Private Local Chat on production, commit `435be0e3f49ab9e4d0f9278545fa1a0471f37367` (route code `7e6c083c691299caf5133e7eb02e417dc949c193`).
The case: Cosmogenitor's PUBLISHED `lantern-keeper` r1 (https://cdn.aiofourown.com/cosmogenitor/data/lantern-keeper/r1/lantern-keeper.json, 585 bytes, SHA-256 `3ad6b43a…ac2a`, equal to the CDN's manifest) downloaded from the CDN,
a link built with PLC's `encodeResourceFragment`, opened in a real Chromium on https://privatelocal.chat/, the downloaded file chosen in the box, the review box shown, Add preset pressed.

Result (`result.json`, script `check.mjs`): the box showed title, version r1 and 585 bytes; nothing was added before choosing the file or at the review; the review said it matches the listing; Add added one preset named Lantern Keeper
("Portray Lantern Keeper. …"); only the analytics beacon was contacted besides the app; no page errors.

**Limits, said plainly:** one run, Chromium, a script drove it (no person); the link was made by PLC's encoder, not by a discovery page; the `page` field was a stand-in (the CDN manifest address) because the inspect page does not exist yet;
the licence in the link (`AGPL-3.0-only`) was read from the file's LICENSE.txt by the script; ferry-clerk r1 was not run; not Safari; no offline test. This file is in a repository, not at a public address, so it is not the `evidence` address a
discovery entry in state `tested` needs.
