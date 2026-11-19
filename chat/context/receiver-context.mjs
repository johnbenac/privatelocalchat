// The host side of the context composer: gathers what one conversation holds (the records through the encounters facade, the person's memory and preferences, admitted designs, reports,
// documents) and hands it to the pure composer (chat/context/composer.mjs). It keeps nothing and writes nothing; every call reads afresh. The sender uses it only when a request is made
// FOR a receiving individual other than the default assistant (chat/core/sender.mjs buildInferenceMessages options.receiver); ordinary chat never comes here (docs/CONTEXT-COMPOSER.md).
//
// createReceiverContext({ encounters, memory(), prefs(), designs?(thread, receiver), reports?(thread, receiver), documents?(thread, view), policy?(thread, receiver), stages? })
//   -> async ({ thread, view, receiver }) -> the composer's result
//   encounters: the facade (window.plcApp.encounters): project, participants, events
import { composeContext } from './composer.mjs';
import { encounterId } from '../encounters/records.mjs';

export function createReceiverContext(host) {
  const { encounters, memory = () => null, prefs = () => null, designs = () => [], reports = () => [], documents = () => [], policy = () => ({}), stages } = host;
  return async function receiverContext({ thread, view, receiver }) {
    const shown = {};
    for (const [id, info] of Object.entries(encounters.project(thread.id) || {})) if (info && !info.legacy && info.event) shown[id] = info.event;
    const ledger = {
      participants: Object.fromEntries(encounters.participants({ thread: thread.id }).map((p) => [p.id, p])),
      events: Object.fromEntries(encounters.events({ thread: thread.id }).map((e) => [e.id, e])),
    };
    return composeContext({
      receiver, encounter: { id: encounterId(thread.id), msgs: shown }, ledger, thread: { id: thread.id, temporary: Boolean(thread.temporary), systemPrompt: thread.systemPrompt },
      messages: view.messages, summary: view.summary || null, documents: await documents(thread, view), design: await designs(thread, receiver), reports: await reports(thread, receiver),
      memory: memory(), preferences: prefs(), policy: policy(thread, receiver) || {}, stages,
    });
  };
}
