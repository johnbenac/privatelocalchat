# Passkey unlock on the Galaxy S8+ (plan step 5.1)

Done by the owner, in person, in Chrome on https://dev.privatelocal.chat on 2026-11-04. Reported in their own words; nothing here was measured by a script.

- Turning encryption on, locking and unlocking worked.
- **Adding the passkey worked** (the phone's own screen lock), so Chrome 131 on this phone does return a PRF secret, which the earlier probe could not show (`getClientCapabilities()` does not exist in that Chrome).
- **Unlocking with the passkey worked**, and so did locking again.
- Nothing surprising. The unlock-time line was not read off the screen; the probe's 0.83 s stands (`probe-galaxy-s8plus-chrome131.json`).
