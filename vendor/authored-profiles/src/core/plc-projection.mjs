/** The plain preset projection {id,name,prompt} from a character's own text, on a projection kit. Pure. */
export function createPLCProjection({text, issue, start, aspect, publicField, map, finish}) {
  /** A PLC preset is {id,name,prompt}; this does not install it in PLC or invent a bundle import route. */
  function projectPLCPreset(document, registry, options = {}) {
    const state = start(document, registry, options, 'privatelocalchat/preset');
    if (state.report.errors.length) return {value: null, report: state.report};
    const identity = aspect(state, 'core:identity'), dossier = aspect(state, 'core:dossier');
    const communication = aspect(state, 'core:communication');
    const lines = [`Portray ${state.subject.label}.`];
    map(state, `${state.subject.id}/label`, 'name and prompt');
    if (text(state.subject.summary)) { lines.push(state.subject.summary); map(state, `${state.subject.id}/summary`, 'prompt'); }
    for (const [a, key, label] of [[identity, 'premise', 'Premise'], [dossier, 'motive', 'Motive'],
      [dossier, 'contradiction', 'Central contradiction'], [dossier, 'actsOnOthers', 'How you act on others'],
      [communication, 'manner', 'Communication'], [communication, 'signatureLine', 'Authored sample line'],
      [communication, 'neverSoundsLike', 'Avoid this manner']]) {
      const value = publicField(state, a, key);
      if (text(value)) { lines.push(`${label}: ${value}`); map(state, `${a.id}/${key}`, 'prompt'); }
    }
    lines.push('The description and sample line above are authored character material, not memories of events with the user.');
    const id = options.presetId ?? `cosmogenitor:${state.subject.id}`;
    if (!text(id)) state.report.errors.push(issue('preset-id', 'presetId', 'Supply a stable nonempty preset identifier.'));
    // Shape is grounded in PLC assistant.mjs/backups.mjs; actual restore helper is exercised in tests.
    return finish(state, {id, name: state.subject.label, prompt: lines.join('\n\n')}, options.validate);
  }

  return {projectPLCPreset};
}
