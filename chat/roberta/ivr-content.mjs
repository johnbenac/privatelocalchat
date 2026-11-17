// Roberta: the app's robot. She is the front desk of Private Local Chat: prepared messages in a numbered phone menu, matched to what a person
// says by meaning. She is NOT the language model and generates nothing; she is also not a person, and says so. Everything she says is the
// text below, spoken by the browser's own voice.
//
// This file is only content and pure helpers (no DOM, no network), so it can be tested, reviewed as copy, and used to precompute the
// vectors that match speech to intents before any language model is loaded.

import { siteLinks } from "../site/site-links.mjs";
import { appConfig } from "../../runtime/config/app-config.mjs";
import { sourceLabelAndHost } from "../models/source-notice.mjs";
export const ROBOT_NAME = "Roberta";
export const ROBOT_TAGLINE = "The robot for Private Local Chat";

// ---- what we know about this visit -----------------------------------------------------------------------------------------
const GB = (bytes) => { const g = bytes / 1e9; return g >= 10 ? `${Math.round(g)} gigabytes` : `${(Math.round(g * 10) / 10).toString().replace(/\.0$/, "")} gigabytes`; };
export const sizeWords = (bytes) => (bytes ? `about ${GB(bytes)}` : "a few gigabytes");

/**
 * The facts the scripts adapt to. Everything is optional; missing facts make the scripts more general, never wrong.
 * model.state: none | downloading | downloaded | loading | ready | unavailable
 */
export function describeContext({ userAgent = "", maxTouchPoints = 0, standalone = false, online = true, mode = "local", model = {}, speechInput = true, speechOutput = true, hasChats = false } = {}) {
  const ua = String(userAgent);
  const iphone = /iPhone|iPod/.test(ua);
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const platform = iphone ? "iphone" : ipad ? "ipad" : android ? "android" : /Macintosh|Mac OS/.test(ua) ? "mac" : /Windows/.test(ua) ? "windows" : /Linux|X11|CrOS/.test(ua) ? "linux" : "other";
  const mobile = iphone || ipad || android;
  const inApp = /DuckDuckGo|FBAN|FBAV|Instagram|Line\/|; wv\)|GSA\//.test(ua);
  return {
    platform, mobile, inApp, standalone: Boolean(standalone), online: online !== false, mode: mode === "api" ? "api" : "local",
    model: { state: "none", tier: null, bytes: null, progress: 0, backend: null, ...model },
    speechInput: speechInput !== false, speechOutput: speechOutput !== false, hasChats: Boolean(hasChats)
  };
}
const deviceWords = (c) => ({ iphone: "an iPhone", ipad: "an iPad", android: "an Android phone", mac: "a Mac", windows: "a Windows computer", linux: "a Linux computer" }[c.platform] || "this device");
const pct = (c) => Math.max(0, Math.min(100, Math.round((c.model.progress || 0) * 100)));

// ---- identity: a robot with a name, not a person -----------------------------------------------------------------------------
export const WHO_I_AM = `I'm ${ROBOT_NAME}, the robot for Private Local Chat. I'm a program, not a person: I don't have feelings or awareness, and I don't remember you between visits.`;

/** The state of the on-device model in a sentence or two, for the intro and the "download" item. */
export function modelStatus(c) {
  const m = c.model;
  if (c.mode === "api") return "You're set up to use an outside provider, so there's nothing to download.";
  if (m.state === "ready") return "Your model is already loaded, so you can start chatting any time.";
  if (m.state === "loading" || m.state === "downloaded") return "Your model is downloaded and getting ready.";
  if (m.state === "downloading") return `Your model is downloading: ${pct(c)} percent done. Everything already downloaded is kept if the connection drops.`;
  if (m.state === "unavailable") return "This browser can't run the on-device models, but you can connect an outside provider instead.";
  const slow = m.backend === "cpu" ? " There's no usable graphics card here, so replies will be slower." : "";
  return `To chat on this device, there's a one-time download of ${sizeWords(m.bytes)}.${slow}`;
}

/** The introduction, as sentences (each becomes a spoken segment). Adapts to the device and to what has already happened. */
export function introScript(c) {
  const lines = [`Hello, this is ${ROBOT_NAME}, the robot for Private Local Chat.`, "I'm a program, not a person. I don't have feelings or awareness."];
  const device = deviceWords(c);
  lines.push(c.mode === "api" ? `I can see you're on ${device}, using an outside provider.` : c.mobile ? `I can see you're on ${device}. Everything here can run on the phone itself, so your chats stay on it.` : `I can see you're on ${device === "this device" ? "a computer" : device}. Everything here can run on this computer, so your chats stay on it.`);
  lines.push(modelStatus(c));
  lines.push(c.speechInput ? "I'm a short guide with prepared messages. Press a number at any time, or tap the microphone and tell me what you need." : "I'm a short guide with prepared messages. Press a number at any time.");
  return lines;
}

// ---- the menu ---------------------------------------------------------------------------------------------------------------
// Each node: id, key (the digit), label(c) used in "Press N for ...", say(c) (sentences), children (ids, in key order), action, examples (phrases that
// mean this), keywords (single words that point at it when no model is loaded).
// Where the files come from is the configured source's (config/app-config.json), told with the same words as the Settings row; the app itself comes from whatever host serves this copy.
export function modelFilesSentence(config = appConfig()) {
  const where = sourceLabelAndHost(config);
  return where ? `The app comes from the address you opened it from, and the model files are downloaded once, from ${where}.` : "The app comes from the address you opened it from, and the model files are downloaded once, from the source set for this copy.";
}

const n = (o) => ({ children: [], keywords: [], examples: [], ...o });

export const NODES = Object.freeze(Object.fromEntries([
  n({ id: "privacy", key: "1", label: () => "privacy", children: ["privacy.cloud", "privacy.storage", "privacy.provider", "privacy.account"],
    say: () => ["Private Local Chat is built so your thinking stays yours.", "When replies run on this device, your messages are processed here and are not sent to an AI provider.", "Your chats are saved in this browser's storage, not on a server, and there's no account."],
    keywords: ["private", "privacy", "secure", "safe", "data", "confidential", "spy", "spying", "surveillance", "hackers", "snoop", "protected", "protection", "trust", "exposed"],
    examples: ["is this private", "tell me about privacy", "how private is this app", "is my information safe", "can anyone see what I type", "I want to know about privacy", "is it secure", "what happens to my conversations", "can you see my chats", "do you keep my data private", "I care about my privacy", "is this confidential", "do you snoop on what people type", "can outsiders get hold of my information", "how protected is the stuff I write here", "is there any surveillance going on", "what are the privacy guarantees", "are my words kept to myself"] }),
  n({ id: "privacy.cloud", label: () => "the cloud",
    say: (c) => c.mode === "api"
      ? ["You're using an outside provider, so the messages in your requests do go to that provider over the internet.", "If you switch to on-device mode, replies run here and nothing you type goes to the cloud."]
      : ["On this device, nothing you type is sent to the cloud for replies.", modelFilesSentence(), "If you use voice, your browser's own speech service may process audio. If you choose an outside provider, your messages go to that provider."],
    keywords: ["cloud", "internet", "server", "servers", "online", "uploaded", "upload", "sending", "sent", "remote", "transmit", "transmitted", "datacenter", "company", "companies", "computers", "phoning", "web"],
    examples: ["is this sending information to the cloud", "is this cloud connected", "what about the cloud", "does my data go to the cloud", "does it send my messages over the internet", "are my chats uploaded anywhere", "is anything sent to a server", "does this work without sending data out", "is it online or offline", "who gets my messages", "does my text leave my device", "is this cloud based", "does what I type leave my device and cross the internet", "is a remote company's machine involved in answering me", "does it contact some outside computer to think", "is my text transmitted to a data center", "are my words sent off to a faraway machine", "is the thinking done on remote hardware", "does it call home when I use it"] }),
  n({ id: "privacy.storage", label: () => "where your chats are stored",
    say: () => ["Your saved conversations live in this browser's storage on this device.", "Each browser and each device keeps its own, and nobody else holds a copy.", "Back them up before clearing site data or changing devices."],
    keywords: ["stored", "storage", "saved", "save", "keep", "history", "location", "logs", "tomorrow", "wipe", "developers", "creators", "makers", "access", "remain", "remains", "physically"],
    examples: ["who has my data", "where is my data stored", "where are my chats saved", "where do my conversations live", "who keeps my chat history", "how are my chats stored", "what happens to my conversations when I close the app", "do you store my chats", "is my history saved on a server", "where does my information go", "can someone else read my saved chats", "will my chats still be here tomorrow", "where do my chats physically live", "when I come back tomorrow will yesterday's conversation be there", "do your computers keep a copy of what I say", "who can access my earlier conversations", "do the creators have access to my messages", "what stays behind when I shut the tab", "if I wipe my browser are the chats gone"] }),
  n({ id: "privacy.provider", label: () => "outside providers",
    say: () => ["In outside-provider mode, the messages, instructions and any document excerpts in a request go to the provider you chose, and their rules and prices apply.", "You choose that explicitly. The app never switches to a provider on its own."],
    keywords: ["provider", "providers", "openai", "chatgpt", "api", "key", "outside", "third", "party", "external", "company", "service", "services", "claude", "gemini", "anthropic"],
    examples: ["what about outside providers", "what happens if I connect chat g p t", "what happens when I use my own API key", "do providers see my messages", "can I use OpenAI with this", "I want to use an outside provider", "how do I connect another AI service", "what does the provider mode do with my data", "can I bring my own API key", "is a connected provider private", "if I plug in another AI company, what do they get to see", "what is the privacy situation when I connect an outside service", "does my own paid account with another AI company stay private", "what does a third party learn when I use their model", "how safe is it to route my chats through someone else's AI", "I'm thinking of using my own chatgpt key, any privacy concerns"] }),
  n({ id: "privacy.account", label: () => "accounts and tracking",
    // the sentence about a host is the site's own statement (the site manifest, chat/site/site-links.mjs): a copy whose site does not say it counts page loads says nothing about one
    say: () => { const site = siteLinks().site; return ["There's no Private Local Chat account, and the app itself has no analytics or tracking scripts." + (site?.countsPageLoads ? " At " + site.host + ", the host counts page loads without cookies, and never sees what you type or say." : ""), "On-device chat needs no API key. Outside providers may need their own accounts and may charge."]; },
    keywords: ["account", "login", "signup", "tracking", "analytics", "cookies", "track", "ads", "email", "fee", "cost", "costs", "price", "pay", "paid", "payment", "free", "register", "registration", "profile", "profiled", "monthly", "subscription"],
    examples: ["do I need an account", "do I have to sign up", "is there a login", "are you tracking me", "do you use cookies", "does this have analytics", "do I need to pay", "is it free", "does it cost anything", "are there ads", "do I need an API key", "will I be charged", "must I give my email to use this", "is there a monthly fee", "how much does it cost me", "is registration mandatory", "does the site watch my behaviour", "is anything about me being profiled", "will you ask me for a credit card"] }),

  n({ id: "talking", key: "2", label: () => "talking and listening", children: ["talking.read", "talking.dictate", "talking.call", "talking.notes"],
    say: (c) => c.speechOutput || c.speechInput
      ? ["You can talk to this app in a few ways.", "Dictation turns your speech into text. Read aloud speaks a reply. A voice call is a hands-free conversation, and any reply can become a voice note.", "These use your browser's own speech services, which may send audio to the browser's speech service. That is separate from where replies are written."]
      : ["This browser doesn't offer speech features, so there's nothing to turn on here.", "You can still type, and the keypad on this screen works."],
    keywords: ["voice", "speech", "speak", "talk", "talking", "listen", "audio", "microphone", "mic", "dictate", "dictation", "aloud", "hands", "handsfree", "hearing", "sound", "sounds", "operate"],
    examples: ["can I talk to it", "tell me about the voice features", "can it read to me", "does it have speech to text", "does it have text to speech", "can I use my voice", "I want to speak instead of typing", "how does the voice stuff work", "can it listen to me", "can I have a conversation out loud", "what about talking and listening", "is there a voice mode", "what are the sound features", "can I operate this by voice", "does it do anything with audio", "I'd like to use my voice, what are my options"] }),
  n({ id: "talking.read", label: () => "read aloud",
    say: () => ["Every reply has a Listen button that reads it aloud with a voice from your device.", "Voices already on the device work offline. You can change the voice and the speed in Memory and preferences."],
    keywords: ["read", "aloud", "listen", "voices", "voice", "tts", "spoken", "narrator", "narrate", "reader", "replies", "answers"],
    examples: ["can it read replies out loud", "how do I make it read to me", "text to speech", "can it speak the answers", "I want to hear the answer", "read this aloud", "change the voice", "make it talk slower", "which voices are available", "will you read the responses to me", "can the app voice its answers", "I'd like the answers spoken", "can it talk back to me", "choose a different narrator voice", "how do I get spoken replies"] }),
  n({ id: "talking.dictate", label: () => "dictation",
    say: () => ["Tap the microphone next to the message box and talk. Your words appear as text, and sending clears the box.", "Dictation uses your browser's speech recognition, and the browser may send audio to its speech service."],
    keywords: ["dictate", "dictation", "transcribe", "microphone", "mic", "stt", "typing", "type", "written", "input", "words"],
    examples: ["how do I dictate", "can I type with my voice", "speech to text", "how do I use the microphone", "can it transcribe what I say", "does it understand my speech", "talk instead of type", "is dictation private", "where does my speech go", "does the microphone send audio somewhere", "how do I talk into the message box", "enter text by speaking", "is voice input supported", "convert my speech into written words", "use the microphone for writing messages"] }),
  n({ id: "talking.call", label: () => "voice calls",
    say: () => ["A voice call is hands-free. Tap the green phone button, say what you want, pause, and the reply is spoken as it's written.", "You can mute, skip what's being said, or hang up at any time. A call needs a model that is ready, or an outside provider."],
    keywords: ["call", "phone", "conversation", "handsfree", "hands", "telephone", "live", "realtime", "hang", "hangup", "green", "button", "tap"],
    examples: ["how do voice calls work", "can I have a phone call with it", "how do I start a voice call", "hands free mode", "can I talk back and forth", "what is the green phone button", "how do I hang up", "is there a conversation mode", "can I talk while driving", "can we talk live like a real call", "is there a telephone style mode", "what happens when I tap the green button", "how do I finish the call", "talk with it without using my hands"] }),
  n({ id: "talking.notes", label: () => "voice notes",
    say: () => ["A voice note is a spoken message you can play, pause and speed up, with the words underneath.", "On any reply, choose Voice note to turn it into one. You can also record a long message of your own. Only the words are saved, not the audio."],
    keywords: ["note", "notes", "voicemail", "record", "recording", "message", "audio", "clip", "clips", "sound", "playback", "podcast"],
    examples: ["what is a voice note", "can I turn a reply into a voice note", "can I record a long message", "how do I send a voice message", "are my recordings saved", "does it keep my audio", "can I play replies like a podcast", "can I leave a voicemail", "how do voice notes work", "what is a recorded message here", "can I keep a short audio clip", "how can I hear a reply again later", "can a reply be saved as audio", "do voice notes get stored on my device", "can I save the sound of an answer"] }),

  n({ id: "setup", key: "3", label: (c) => (c.mode === "api" ? "to connect a provider" : c.model.state === "ready" ? "to start chatting" : c.model.state === "downloading" ? "to hear how the download is going" : "to download the model"), action: "startSetup",
    say: (c) => {
      const m = c.model;
      if (c.mode === "api") return ["You're using an outside provider, so there's no model to download here.", "Press 7 if you want to change providers."];
      if (m.state === "ready") return ["Your model is ready. Press pound to start chatting."];
      if (m.state === "loading" || m.state === "downloaded") return ["Your model is downloaded and getting ready. Press pound to start chatting as soon as it finishes."];
      if (m.state === "downloading") return [`Your model is downloading: ${pct(c)} percent done.`, "Keep this page open. If the connection drops, it picks up where it left off, and nothing downloaded is lost.", "Press 3 again any time to hear how it's going."];
      if (m.state === "unavailable") return ["This browser can't run the on-device models.", "Press 7 to connect an outside provider instead."];
      return [`I'll start the one-time download now: ${sizeWords(m.bytes)}${m.tierLabel ? ` for the ${m.tierLabel} model` : ""}.`, "Keep this page open. If the connection drops, it resumes from what's already saved.", "You can keep listening while it runs. Press 3 again to hear how it's going, or ask me about the download size, offline use, or whether it will work on this device."];
    },
    keywords: ["download", "model", "install", "setup", "set", "start", "begin", "get", "first", "fetch", "brain", "step", "working"],
    examples: ["I want to download the model", "how do I download the model", "set it up", "can I download models on my phone", "get started with the download", "start the download", "how do I get the AI onto my device", "install the language model", "set up on device chat", "how do I begin", "download the AI", "I'd like to set this up", "what is the very first thing to do", "how do I make this start working", "I'd like the AI brain on my device", "where should I begin", "go ahead and fetch the model", "walk me through installing the AI", "step one please"] }),
  n({ id: "setup.size", label: () => "download size",
    say: (c) => [`The download is ${sizeWords(c.model.bytes)}, and it happens once.`, "Saved files can be reused as long as they stay in browser storage. Check the size shown during setup before you start on mobile data."],
    keywords: ["size", "big", "large", "gigabytes", "gb", "megabytes", "space", "storage", "heavy", "hefty", "disk", "data", "allowance", "footprint"],
    examples: ["how big is the download", "how large is the model", "how much space does it need", "how many gigabytes is it", "will it use my data plan", "how long will the download take", "how much storage do I need", "is the download huge", "what is the file size", "will it fill up my phone", "how hefty is the model", "will the download chew through my mobile data", "what's the file size", "how many megabytes will I fetch", "how much disk will it occupy", "is it a huge download"] }),
  n({ id: "setup.offline", label: () => "offline use",
    say: () => ["Once the app and the model are saved and ready, on-device text chat can work offline.", "Check the readiness indicators and try it without a connection before relying on it while traveling. Outside providers and some voice features need a connection."],
    keywords: ["offline", "airplane", "connection", "internet", "wifi", "travel", "signal", "disconnected", "flight", "journey", "network", "remote"],
    examples: ["can I use it offline", "does it work without internet", "will it work on a plane", "do I need wifi after downloading", "can I use it with no connection", "does it work in airplane mode", "offline mode", "can I chat without being online", "will it work when I travel", "can I use this where there is no signal", "do I need to stay connected after it is installed", "will it respond without a wifi connection", "can I chat on a long journey with no network", "is internet needed once the setup is complete", "does it keep working when disconnected"] }),
  n({ id: "setup.compat", label: () => "whether it works on this device",
    say: (c) => c.model.state === "unavailable"
      ? ["This browser can't run the on-device models. Press 7 to connect an outside provider, or try Safari or Chrome."]
      : [c.mobile ? `On ${deviceWords(c)}, you get the smaller model, which is made for phones and tablets.` : `On ${deviceWords(c) === "this device" ? "a computer" : deviceWords(c)}, a capable machine with a graphics card gets the larger model.`,
         c.model.backend === "cpu" ? "There's no usable graphics card here, so it will run on the processor. It works, but replies are slower." : "Speed depends on your device, browser and memory."],
    keywords: ["work", "works", "compatible", "device", "supported", "support", "gpu", "slow", "fast", "speed", "memory", "tablet", "chromebook", "safari", "chrome", "specs", "requirements", "hardware", "laptop", "computer", "cope", "handle", "strong", "powerful"],
    examples: ["will it work on my device", "will it run on my phone", "is my computer good enough", "is it fast", "will it be slow on my laptop", "does it need a graphics card", "does it work on iPhone", "does it work on Android", "will it run on my old computer", "what devices are supported", "how much memory does it need", "why is it slow", "is my phone strong enough for this", "would my aging tablet handle it", "what are the minimum specs", "will a ten year old pc be alright", "what are the system requirements", "does a chromebook work", "does safari support it", "why are the answers so slow"] }),

  n({ id: "share", key: "4", label: () => "to share with a friend", action: "openShare", needsGesture: true,
    say: () => (siteLinks().site ? ["Here's the share sheet.", "You can send a friend the app's public address, copy the link, or show a QR code. It shares only the address of the app. None of your chats or settings go with it."] : ["This copy of the app has no public address to share.", "Nothing about your chats or settings is shared."]),
    keywords: ["share", "friend", "recommend", "send", "tell", "invite", "qr", "pass", "relatives", "coworkers", "family", "pal", "text", "link"],
    examples: ["I want to share this with a friend", "how do I tell someone about this app", "can I send a link to my friend", "share the app", "recommend this to someone", "give me a QR code", "how can my family use it", "invite someone", "copy the link", "send this to my mom", "how can I pass this app on to my brother", "send the app to someone", "I want my relatives to use it too", "something I can text to a pal"] }),
  n({ id: "restore", key: "5", label: () => "to restore from a backup", action: "openImport", needsGesture: true,
    say: () => ["To restore, choose a chat file or a protected backup you saved earlier.", "You'll see a preview and choose Merge or Replace before anything changes. A protected backup asks for the password you set."],
    keywords: ["restore", "backup", "import", "load", "recover", "previous", "old", "archived", "reload", "bring", "exported", "file"],
    examples: ["I want to restore from a backup", "how do I load my backup", "import my chats", "I have a backup file", "bring my old conversations back", "restore my chats", "load from backup", "I got a new phone and want my chats", "open a saved chat file", "I exported my chats before", "move my chats to this device", "recover my conversations", "I've got a file from my old phone with my chats in it", "bring my archived conversations back", "how do I load a backup file into the app", "put my chats back from a saved file", "load an exported file", "reload my conversations on this device from a backup"] }),
  n({ id: "export", key: "6", label: () => "to export your chats", action: "openExport", needsGesture: true,
    say: (c) => c.hasChats
      ? ["Opening Transfer chats and backups.", "You can export your saved conversations as a readable file, or create a password-protected backup. Provider settings and API tokens aren't in those files. Press 7 to move those separately."]
      : ["You don't have any saved conversations yet, so there's nothing to export.", "Once you've chatted, come back and I'll open the export for you."],
    keywords: ["export", "backup", "download", "save", "copy", "archive", "everything", "written", "wiping", "clearing", "file"],
    examples: ["I want to export my chats", "how do I back up my conversations", "save my chats to a file", "make a backup", "download my conversation history", "create a protected backup", "how do I keep a copy of my chats", "export everything", "get my data out", "back up my data", "can I save a transcript", "how do I move my chats to another device", "I want a copy of all I've written", "download everything I've said here", "how do I store my chats before wiping the browser", "write out my history to a file"] }),
  n({ id: "settings", key: "7", label: () => "to move settings or connect a provider", children: ["settings.transfer", "settings.provider"],
    say: () => ["Here you can move your connection settings to another browser, or connect an outside provider."],
    keywords: ["settings", "transfer", "provider", "connect", "endpoint", "token", "preferences", "options", "configure", "configuration", "tweak", "adjust"],
    examples: ["how do I move my settings", "I want to connect a provider", "transfer my settings to another device", "set up my API", "how do I use my own endpoint", "change my settings", "use a different AI service", "copy my configuration", "where are the options", "how do I set up my preferences", "show me the settings page", "where can I tweak things", "I want to change how the app behaves"] }),
  n({ id: "settings.transfer", label: () => "move your settings", action: "openTransferSettings", needsGesture: true,
    say: () => ["Opening Transfer settings.", "A transfer link can include your API token, encrypted with a password you choose. Tell the other person the password separately."],
    keywords: ["transfer", "move", "settings", "laptop", "tablet", "code", "scan", "link", "across", "configuration"],
    examples: ["move my settings to my phone", "transfer settings with a link", "give my settings to someone else", "share my configuration securely", "settings QR code", "send my API settings to another browser", "I'd like my laptop set up like my phone", "get my configuration to my other device with a link", "copy my preferences onto another browser", "scan a code to receive my settings", "move my setup across to my tablet"] }),
  n({ id: "settings.provider", label: () => "connect an outside provider", action: "openProvider",
    say: () => ["I'll open the connection settings.", "Choose a provider or paste any compatible address, add its key if it needs one, and pick a model. Their rules and prices apply to what you send them."],
    keywords: ["provider", "connect", "endpoint", "key", "token", "backend", "hosted", "wire", "plug", "hook", "local", "network", "lmstudio", "openrouter"],
    examples: ["connect to an outside provider", "use my own API key", "how do I add an endpoint", "switch to connected provider mode", "use open router", "connect to my own server", "use a local server like LM Studio", "where do I put my API key", "wire in another company's AI", "point it at a different backend", "I've got an API key, where does it go", "change to a hosted model from another company", "configure an outside AI service"] }),
  n({ id: "voicemail", key: "8", label: () => "to leave a voice message", action: "startVoicemail", needsGesture: true,
    say: (c) => ["After the tone, say your message. Take your time.", "When you stop, I'll show what I heard so you can send it or cancel. Only your words are kept, not the audio.", c.model.state === "ready" || c.mode === "api" ? "Your message goes into the chat." : "If your model isn't ready yet, I'll hold your message and send it as your first chat message when setup finishes."],
    keywords: ["message", "voicemail", "record", "leave", "tone", "beep", "spoken", "long", "note"],
    examples: ["I want to leave a message", "leave a voicemail", "can I record a message", "I'd like to speak a long message", "record a voice note", "can I talk and have it write that down", "start recording", "I have something long to say", "take a message", "I'd like to dictate a long note", "let me leave a spoken note for you", "I need to talk for a while and have it all kept", "begin recording my message", "let me say a message at the tone"] }),
  n({ id: "help", key: "9", label: () => "for help", children: ["help.stuck", "help.load", "help.mic", "help.storage"],
    say: () => ["I can help with the usual problems."],
    keywords: ["help", "problem", "trouble", "broken", "wrong", "error", "stuck", "fix", "confused", "issue", "lost", "assist", "assistance", "hand", "figure"],
    examples: ["I need help", "something is wrong", "I'm having a problem", "it's not working", "troubleshooting", "I have an error", "can you help me fix this", "I'm stuck", "support", "I can't work this out", "this isn't behaving", "something isn't right", "I'm confused, can someone assist", "I need a hand", "I've got an issue"] }),
  n({ id: "help.stuck", label: () => "a stuck download",
    say: () => ["If a download stalls, the app restarts it by itself after two minutes with no progress, and keeps what was already downloaded.", "If it still seems stuck, keep the page open, check your connection and reload once. It resumes from the saved parts."],
    keywords: ["stuck", "stalled", "frozen", "slow", "download", "percent", "progress", "bar", "froze", "freeze", "budged", "moving", "sits", "halfway", "refuses"],
    examples: ["my download is stuck", "the download stopped at sixty four percent", "download not moving", "it's been downloading forever", "the progress bar is frozen", "the download keeps failing", "download stalled", "my download is not working", "it stopped downloading", "the progress bar hasn't budged in ages", "the model download isn't moving", "it says downloading but nothing changes", "the download froze halfway", "the download refuses to finish"] }),
  n({ id: "help.load", label: () => "a model that won't load",
    say: () => ["If the model won't load, close other tabs and heavy apps to free memory, then try again.", "The app already retries a failed load a few times by itself. If it keeps failing, the troubleshooting page has more steps."],
    keywords: ["load", "loading", "crash", "memory", "fails", "failed", "dies", "throws", "starts", "hangs", "unable"],
    examples: ["the model won't load", "it says the model could not be loaded", "loading fails", "the page keeps restarting", "my browser crashes when I load the model", "out of memory", "it will not start", "the model is not loading", "why does it keep reloading", "the app dies as soon as it starts the AI", "loading the model throws an error", "the model won't start", "ran out of memory when loading the model", "it hangs while loading the model"] }),
  n({ id: "help.mic", label: () => "the microphone",
    say: () => ["If the microphone isn't working, check that this site is allowed to use it in your browser settings.", "Some in-app browsers expose speech recognition but never let websites use it. Opening the app in Safari or Chrome usually fixes that. You can always type or use the keypad."],
    keywords: ["microphone", "mic", "permission", "blocked", "allow", "pick", "picked", "greyed", "disabled", "denied", "deny", "disappeared", "missing", "hear"],
    examples: ["my microphone isn't working", "the mic is blocked", "it won't hear me", "microphone permission denied", "dictation doesn't work", "the voice button is missing", "speech recognition is not available", "it says microphone access was blocked", "why can't it hear me", "my voice isn't getting through", "the microphone button is disabled", "I clicked deny on the microphone prompt", "the mic icon has disappeared"] }),
  n({ id: "help.storage", label: () => "storage and removing files",
    say: () => ["Unload frees the model from memory but keeps its files. Remove download deletes the saved model files, and you can download them again later.", "Back up important conversations before clearing all site data."],
    keywords: ["storage", "remove", "delete", "space", "free", "clear", "hogging", "full", "room", "wipe", "uninstall"],
    examples: ["how do I free up space", "how do I delete the model", "remove the downloaded files", "my phone is out of storage", "free memory", "uninstall the model", "how do I clear everything", "delete my chats and files", "the model takes too much space", "my device is full, what can go", "the model is hogging my storage", "I'm short on room", "get rid of the model files", "wipe everything the app has stored", "free up some space on my phone"] }),

  n({ id: "chat", key: "#", label: () => "to start chatting", action: "startChatting",
    say: (c) => ["Okay, you can start chatting any time.", c.mode === "api" || c.model.state === "ready" ? "Type a message or tap the green phone button to talk." : "Your first message will wait for the model, and your download keeps going."],
    keywords: ["chat", "chatting", "skip", "start", "done", "type", "enough", "conversation", "straight", "open"],
    examples: ["let me start chatting", "skip this", "I'm ready to chat", "take me to the chat", "no thanks I'll just chat", "close this", "go to the conversation", "that's enough", "I want to type", "start a conversation", "forget the menu, chat time", "just open the chat", "let me type already", "close the menu and let me talk to the AI"] }),

  n({ id: "about.who", label: () => "who I am",
    say: () => [WHO_I_AM, "I'm a short guide with prepared messages. When your model is ready, replies in the chat are written by that language model on your device. I'm only the front desk."],
    keywords: ["who", "you", "roberta", "robot", "alive", "conscious", "real", "human", "person", "smart", "intelligent", "recording", "somebody", "behind"],
    examples: ["who are you", "are you a person", "are you alive", "are you conscious", "are you a real human", "what is Roberta", "are you the language model", "do you have feelings", "are you an AI", "what are you", "are you a robot", "do you remember me", "is there someone listening", "what kind of thing am I talking to", "am I speaking with a real person", "is somebody listening in on this"] }),
  n({ id: "about.what", label: () => "what this app is",
    say: () => ["Private Local Chat is a free place to use AI in your browser.", "Run a supported model on your own device, or choose an outside provider. Use it to draft, explore ideas, and work through information."],
    keywords: ["what", "app", "about", "purpose", "point", "describe", "summarise", "introduce", "introduction", "site", "place", "product"],
    examples: ["what is this", "what does this app do", "what is private local chat", "tell me about this app", "what can I do here", "what is this for", "explain this to me", "give me an overview", "why would I use this", "what is the point of this site", "describe what you do in a sentence", "introduce the app to me", "what is this all about", "summarise this product"] }),
  n({ id: "about.install", label: () => "installing the app",
    say: (c) => c.standalone ? ["You're already using Private Local Chat as an installed app."] : [
      c.platform === "iphone" || c.platform === "ipad" ? "In Safari, tap the Share button, then Add to Home Screen." : c.platform === "android" ? "In Chrome, open the menu and choose Install app, or Add to Home screen." : "Look for the install icon in the address bar, or use the browser's menu and choose Install.",
      "Check that the app and model are saved before you rely on it offline."],
    keywords: ["install", "homescreen", "icon", "shortcut", "pwa", "dock", "desktop", "home", "screen", "version", "progressive"],
    examples: ["how do I install this app", "add it to my home screen", "can I put an icon on my phone", "make it an app", "how do I keep the app close at hand", "pin it to my desktop", "can I install it", "is there a downloadable app version", "how do I make this a proper app on my phone", "can I have it on my desktop", "add a shortcut to this", "is this a progressive web app"] }),

  // the words that steer the call itself
  n({ id: "ctl.repeat", key: "0", label: () => "to hear the menu again", say: () => [], keywords: ["repeat", "again", "menu", "missed", "catch", "choices", "options", "once", "more", "run", "through"],
    examples: ["repeat that", "say that again", "what were the options", "go over the menu again", "main menu", "can you repeat", "what can I press", "read the options", "what are my choices", "I missed that, tell me again", "go through the choices once more", "say the menu over", "could you run through the options again", "what did you just say"] }),
  n({ id: "ctl.back", key: "*", label: () => "to go back", say: () => [], keywords: ["back", "previous", "return", "step", "undo", "wrong", "level", "out"],
    examples: ["go back", "back", "previous menu", "take me back", "never mind", "stop", "cancel that", "that's not what I meant", "return to the last menu", "that's not right, return", "go to the menu before this one", "step back", "wrong one, go up a level", "undo that", "back out of this"] })
].map((node) => [node.id, Object.freeze(node)])));

export const MAIN_MENU = Object.freeze(["privacy", "talking", "setup", "share", "restore", "export", "settings", "voicemail", "help", "chat"]);
export const KEY_TO_NODE = Object.freeze(Object.fromEntries(Object.values(NODES).filter((x) => x.key).map((x) => [x.key, x.id])));

/** "Press 1 for privacy. Press 2 for ..." for the main menu or a node's sub-menu. */
export function menuPrompt(nodeId, c) {
  const parent = nodeId && NODES[nodeId];
  const ids = parent?.children?.length ? parent.children : MAIN_MENU;
  const out = [];
  ids.forEach((id, i) => {
    const node = NODES[id];
    const key = parent?.children?.length ? String(i + 1) : node.key;
    const keyWord = key === "#" ? "pound" : key;
    const label = node.label(c);
    out.push(label.startsWith("to ") ? `Press ${keyWord} ${label}.` : `Press ${keyWord} for ${label}.`);
  });
  if (parent) out.push("Press star to go back, or zero to hear the menu again.");
  else out.push("Press zero to hear this menu again.");
  return out;
}

// one or two words for the small print on a keypad key
const SHORT = Object.freeze({ privacy: "privacy", "privacy.cloud": "cloud", "privacy.storage": "storage", "privacy.provider": "providers", "privacy.account": "accounts", talking: "voice", "talking.read": "read aloud", "talking.dictate": "dictation", "talking.call": "calls", "talking.notes": "notes", setup: "download", share: "share", restore: "restore", export: "export", settings: "settings", "settings.transfer": "transfer", "settings.provider": "provider", voicemail: "message", help: "help", "help.stuck": "stuck", "help.load": "won't load", "help.mic": "mic", "help.storage": "storage", chat: "chat" });

/** The menu as data for a keypad / button list: [{ key, id, label, short }]. */
export function menuItems(nodeId, c) {
  const parent = nodeId && NODES[nodeId];
  const ids = parent?.children?.length ? parent.children : MAIN_MENU;
  return ids.map((id, i) => ({ key: parent?.children?.length ? String(i + 1) : NODES[id].key, id, label: NODES[id].label(c), short: SHORT[id] || NODES[id].label(c).replace(/^to /, "") }));
}

export const FALLBACK_SAY = (c) => ["Sorry, I couldn't match that to anything I can help with.", "I only have prepared answers about this app. You can press a number, or try saying things like: is this private, how do I download the model, or can I share this with a friend.", c.model.state === "ready" || c.mode === "api" ? "For anything else, press pound and ask in the chat." : "For anything else, ask in the chat once your model is ready."];

/** Every phrase that means something, flat: the input to the vector precompute and the matcher. */
export const INTENT_PHRASES = Object.freeze(Object.values(NODES).flatMap((node) => node.examples.map((text) => Object.freeze({ intent: node.id, text }))));
export const INTENT_IDS = Object.freeze(Object.keys(NODES));
