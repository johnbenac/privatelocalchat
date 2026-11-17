# Face ID on the iPhone 15 Pro (plan step 5.4)

Done by the owner, in person, on https://dev.privatelocal.chat (build f3d9124) on 2026-11-04. Reported in their own words; nothing here was measured by a script.

- Turning encryption on and adding Face ID worked.
- **Face ID unlocked the vault** from the unlock screen.
- Locking and unlocking, with Face ID and by passphrase, worked; everything stayed encrypted.
- **One thing surprised us:** iOS asked for a *username* when the passphrase was typed and offered to save it in the keychain. The app does not use a username; iOS wanted a name to file the saved password under, because the passphrase box had no username field next to it. Fixed afterwards by giving both passphrase screens a fixed hidden name ("Private Local Chat") so the password manager has one and does not ask.

Not reported: the "Unlocking with the passphrase took N seconds" number from this phone, and whether Safari asked for Face ID once or twice when the passkey was made.
