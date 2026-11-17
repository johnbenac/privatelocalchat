// The one description of a model row, used by Settings > Models and by both composer menus, so a model reads the same everywhere:
// its name, an "In use" badge, one line of state words (chat/models/models-view.mjs), a progress bar while it downloads, and the action a click will do.
import { stateLine, toggleAction } from "../models/models-view.mjs";

export function rowParts(vm, extra = []) {
  return {
    label: vm.label, inUse: Boolean(vm.inUse), state: vm.state, kind: vm.kind,
    desc: [stateLine(vm), vm.note, vm.license, ...extra].filter(Boolean).join(" · "),
    progress: vm.state === "downloading" && vm.progress != null ? vm.progress : null,
    action: toggleAction(vm),
  };
}

/** The text block of a row: label with its badge, description, progress. `classes` names the style hooks of the place it is drawn in. */
export function renderRowText(h, parts, classes = { box: "set-text", label: "set-label", desc: "set-desc", badge: "set-inuse" }) {
  const box = h("div", { class: classes.box },
    h("div", { class: classes.label }, parts.label, parts.inUse ? h("span", { class: classes.badge, text: "In use" }) : null),
    h("div", { class: classes.desc, text: parts.desc }));
  if (parts.progress != null) box.append(h("progress", { max: "1", value: String(parts.progress), "aria-label": "Download progress" }));
  return box;
}
