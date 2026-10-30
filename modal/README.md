# Modal self-hosted Muse Glimmer endpoint (verified test plumbing)

Bounded test infrastructure, verified 30 Oct 2026: authenticated client ->
llama.cpp server -> complete grounded digest from Muse Glimmer 30B.

- Model: `Muse-Glimmer-30B-UD-Q4_K_XL.gguf`, community quant by unsloth of
  Meta's open-weights Muse Glimmer 30B (Apache-2.0).
  Source: https://huggingface.co/unsloth/Muse-Glimmer-30B-GGUF
  LFS sha256: 82bece304887a313ece08400bc030f6066c7bff5b906b0cd40308ec8a409fd38
- Runtime: llama.cpp b11977 server image, CPU only (16 vCPU / 28 GB).
- `glimmer_app.py` deploys the endpoint app `tracemint-glimmer-test`
  (web server on :8000, Bearer key via GLIMMER_KEY secret, weights cached on
  the `glimmer-weights` volume so later runs skip the ~16 GB download).
- `glimmer_client.py` is the e2e check: unauthenticated request must 401,
  then one keyed digest request, result written to the volume.
- Endpoint URL and API key come from env vars (`GLIMMER_URL`, `GLIMMER_KEY`),
  never committed.
- The app is normally STOPPED (scales to zero); deploy only for a bounded
  test and stop it right after.

## Live-test timing (learned 30 Oct)

A digest through the app takes ~4-4.5 min on this CPU endpoint: ~4.7 tok/s
decode plus prompt eval and container overhead. The llama.cpp server keeps
decoding after a client disconnects, and platform cancellation can lag by
minutes. Rules for any live run:

1. Exactly one request in flight (`--parallel 1` on the server; queue, never
   parallel clients).
2. Client timeout >= 480s; if a request must be abandoned, `modal app stop`
   immediately - closing the client does NOT stop server-side decode.
3. Set a watchdog BEFORE starting: `sleep <budget> && modal app stop <app> --yes`
   detached, so the stop does not depend on anyone being at the keyboard.
4. `max_tokens` in src/lib/muse.ts is capped so a decode that misses its stop
   token still terminates.
