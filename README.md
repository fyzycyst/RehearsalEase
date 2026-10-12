# RehearsalEase — a little space to practice

A static desktop Chrome English rehearsal app. Prepare a plain-text or Markdown script, choose a positive target (default 2:00), check local English, and explicitly Start rehearsal. Rehearse provides sentence following, click recovery, text size, status and Finish/Stop controls. Review summarizes actual time, target difference, approximate recognized pace and measured quiet intervals when available.

## Local development and checks

No dependencies are required. Serve this directory with a local static HTTP server and open it in desktop Chrome. Microphone use requires a secure context such as localhost or HTTPS.

- `npm test` runs the Node regression suite.
- `npm run build` creates `deploy/rehearsalease-public`.
- `node --check app.mjs` checks module syntax; the same check applies to all modules and the builder.

## Static deployment

The Vercel configuration uses no framework, runs `npm run build`, and publishes only `deploy/rehearsalease-public`. The builder cleans that dedicated output, copies ten runtime files, and independently generates a generic public sample. Exactly eleven assets are published. Tests, source samples, documentation, hidden metadata and credentials stay outside that output. No functions, analytics or paid add-ons are configured. Publish only this generated output when using a manual static upload.

## Privacy and browser support

Scripts, recognized text and settings remain in memory for this session. No persistent storage, recordings, external assets, upload or cloud recognition is implemented. Recognition requires Chrome’s on-device English and shared-track APIs; support varies by browser and device. Check local English and explicitly download the English language pack if needed before Start. Pack download is a Chrome-managed action and never starts the microphone.

Stay quiet during the one-second calibration, read at your own pace, and use Finish or Stop microphone to end a run. Backgrounding interrupts the rehearsal. Cleanup stops app-owned tracks immediately and bounds recognition finalization. Review reports confirmed cleanup only when observed; otherwise check Chrome’s microphone indicator. There is no automatic restart or cloud fallback. Quiet detection and recognized pace are approximate; noise, soft speech and missing acoustic input can affect availability or accuracy.

After deployment, verify the HTTPS origin in desktop Chrome: readiness, explicit Start, speech following, a deliberate pause, Finish/Stop, Review and microphone indicator shutdown. Verify diagnostic routes are absent. Automated tests do not establish browser or hardware behavior on a deployed origin.

See [architecture](docs/ARCH.md), [interfaces](docs/INTERFACES.md) and [invariants](docs/INVARIANTS.md).
