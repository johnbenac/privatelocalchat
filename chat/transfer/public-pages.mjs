// The only script on the public pages. It mounts the product-share panel where a page asks for one (data-product-share) and copies a
// field's text on request (data-copy-from). The pages are complete without it: it loads no model code and nothing is fetched.
import { mountProductShare } from "./product-share.mjs";

for (const node of document.querySelectorAll("[data-product-share]")) mountProductShare(node, { shareAddress: location.origin + "/" }); // these pages are served from the site itself, so its own address is the one to share

for (const button of document.querySelectorAll("button[data-copy-from]")) {
  const source = document.getElementById(button.dataset.copyFrom);
  const status = document.getElementById(button.dataset.copyStatus || "");
  button.hidden = false; // without this script there is nothing to run, so the button is only shown once it can work
  button.addEventListener("click", async () => {
    const text = source?.value ?? source?.textContent ?? "";
    let done = false;
    try { await navigator.clipboard.writeText(text); done = true; } catch { /* select it instead */ }
    if (!done && source?.select) { source.focus(); source.select(); }
    if (status) status.textContent = done ? "Copied" : "Select the text and copy it.";
  });
}
