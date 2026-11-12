// The unlock screen: shown before anything else when a vault exists. It is self-contained (the app has not started, so nothing else exists yet) and uses the page's
// existing lock-screen styles. unlockScreen.unlock({ vault, header, marker }) resolves with the unlocked vault session.
//   - a passphrase field; wrong guesses wait longer after the fifth (chat/crypto.mjs lockDelaySeconds)
//   - a "Unlock with Face ID / Touch ID" button when the vault has a passkey (chat/vault/passkey.mjs)
//   - "Forgot it?" erases everything after two explicit steps (there is no recovery, and the screen says so)
import { lockDelaySeconds } from "../crypto.mjs";
import { createPadlock, playPadlock } from "../lock/padlock.mjs";

const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
export const unlockScreen = {
  unlock({ vault, header, marker = {}, erase = null }) {
    return new Promise((resolve) => {
      try { const theme = localStorage.getItem("plc.theme.v1"); if (theme === "dark" || theme === "light") document.documentElement.setAttribute("data-theme", theme); } catch { /* private mode: the default theme */ }
      document.documentElement.classList.add("locked"); window.__plcVaultLocked = true; // the page's start-up check must not call a waiting unlock screen a failed start
      const app = document.getElementById("app"); if (app) { app.inert = true; app.setAttribute("aria-hidden", "true"); }
      const screen = h("div", "lock-screen"); screen.id = "lockScreen"; screen.setAttribute("role", "dialog"); screen.setAttribute("aria-modal", "true"); screen.setAttribute("aria-label", "Unlock Private Local Chat");
      const form = h("form"); const icon = h("div", "lock-icon"); icon.appendChild(createPadlock());
      const title = h("h2", null, "Private Local Chat is locked");
      const note = h("p", "muted lock-note", "Your chats, documents, memory and settings are encrypted. Type your passphrase to open them."); 
      const user = h("input", "sr-only"); user.type = "text"; user.name = "username"; user.autocomplete = "username"; user.value = "Private Local Chat"; user.tabIndex = -1; user.setAttribute("aria-hidden", "true"); user.readOnly = true; // gives the OS password manager a fixed name, so it does not ask the person for one
      const label = h("label", "sr-only", "Passphrase"); label.htmlFor = "unlockPass";
      const pass = h("input"); pass.type = "password"; pass.id = "unlockPass"; pass.autocomplete = "current-password"; pass.placeholder = "Passphrase"; pass.autofocus = true;
      const go = h("button", "primary", "Unlock"); go.type = "submit";
      const msg = h("p", "danger"); msg.setAttribute("role", "alert");
      const face = h("button", "secondary", "Unlock with Face ID or Touch ID"); face.type = "button"; face.id = "unlockPasskey"; face.hidden = true;
      const forgot = h("button", "link-btn", "Forgot the passphrase?"); forgot.type = "button";
      const erasePanel = h("div", "lock-erase"); erasePanel.hidden = true;
      erasePanel.append(h("p", "danger", "There is no way to recover a forgotten passphrase. You can erase everything this app saved in this browser (chats, documents, memory, settings) and start over. Downloaded models are kept."));
      const eraseGo = h("button", "danger", "Erase everything and start over"); eraseGo.type = "button";
      const eraseNo = h("button", "link-btn", "Keep trying"); eraseNo.type = "button";
      erasePanel.append(eraseGo, eraseNo);
      form.append(icon, title, note, user, label, pass, go, face, msg, forgot, erasePanel); screen.appendChild(form); document.body.appendChild(screen); playPadlock(screen, "locking"); // the bar snaps shut as the screen appears

      let failures = 0, lockedUntil = 0, busy = false;
      const finish = (session) => {
        // The lock opens first, with nothing else going on (the app would stutter it if it started now): the bar slides up, swings round, then the screen fades and the app starts.
        playPadlock(screen, "unlocking"); screen.style.pointerEvents = "none";
        window.setTimeout(() => {
          screen.classList.add("leaving");
          window.__plcVaultLocked = false; window.dispatchEvent(new Event("plc-vault-unlocked"));
          document.documentElement.classList.remove("locked"); document.documentElement.classList.remove("splashing"); if (app) { app.inert = false; app.removeAttribute("aria-hidden"); }
          resolve(session);
          window.setTimeout(() => screen.remove(), 600);
        }, 1150);
      };
      const hasPasskey = (header.wraps || []).some((w) => w.type === "passkey");
      if (hasPasskey) {
        import("./passkey.mjs").then((pk) => { if (pk.passkeySupported()) { face.hidden = false; } }).catch(() => {});
        face.addEventListener("click", async () => {
          if (busy) return; busy = true; face.setAttribute("aria-busy", "true"); msg.textContent = "";
          try { const pk = await import("./passkey.mjs"); finish(await pk.unlockWithPasskey({ vault, header })); return; } catch (error) { msg.textContent = error?.message || "Face ID or Touch ID did not unlock it. Type your passphrase instead."; }
          busy = false; face.removeAttribute("aria-busy");
        });
      }
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const wait = Math.ceil((lockedUntil - Date.now()) / 1000);
        if (wait > 0) { msg.textContent = "Too many tries. Wait " + wait + " seconds."; return; }
        if (busy || !pass.value) return;
        busy = true; go.setAttribute("aria-busy", "true"); msg.textContent = "Unlocking…";
        const started = performance.now();
        try { const session = await vault.unlock(pass.value); window.__plcVaultUnlockMs = Math.round(performance.now() - started); finish(session); return; } // how long the passphrase took on this device (shown in Settings)
        catch (error) {
          if (error?.code === "bad-passphrase") { failures++; const delay = lockDelaySeconds(failures); lockedUntil = Date.now() + delay * 1000; msg.textContent = "That passphrase is not right." + (delay ? " Wait " + delay + " seconds before trying again." : ""); playPadlock(screen, "denied"); pass.select(); }
          else msg.textContent = error?.message || "The vault could not be opened.";
        }
        busy = false; go.removeAttribute("aria-busy");
      });
      forgot.addEventListener("click", () => { erasePanel.hidden = false; forgot.hidden = true; });
      eraseNo.addEventListener("click", () => { erasePanel.hidden = true; forgot.hidden = false; pass.focus(); });
      eraseGo.addEventListener("click", async () => { eraseGo.disabled = true; try { await (erase || (await import("./vault-store.mjs")).eraseEverything)(); } finally { location.reload(); } });
      window.setTimeout(() => pass.focus(), 0);
    });
  }
};
