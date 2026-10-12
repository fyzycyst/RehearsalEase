# RehearsalEase architecture

Static HTML, CSS and ES modules; no backend or storage. `app.mjs` mounts Prepare, Rehearse and Review using textContent. Its adapter seam supports injected runtimes for tests. The primary entry selects shared-track local recognition; generic mounts default to voice-only.

`script.mjs` normalizes plain text/Markdown and validates target duration. `core.mjs` matches sentence positions and checks local recognition support. `session.mjs` freezes run inputs, owns monotonic timing, transcript ledger and cleanup transition. `voice-runtime.mjs` requires local English and owns capture/recognition cleanup with bounded finalization. `quiet.mjs` detects measured acoustic intervals after valid calibration. `review.mjs` summarizes finalized recognized words and elapsed time. `pack.mjs` explicitly installs local English. `sample.mjs` provides a generic source fixture; the public builder generates an independent generic sample.

The static build allowlists runtime files. All test modules and documentation remain outside the eleven published assets. Runtime behavior on a deployed browser origin requires a manual compatibility check.
