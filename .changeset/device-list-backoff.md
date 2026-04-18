---
"@vex-chat/libvex": minor
---

`ClientOptions` now accepts an optional `devApiKey` string; when set, it is sent as `x-dev-api-key` on every HTTP request (intended for local/load-testing against a dev spire — do not use in production). Device-list fetches now retry with exponential backoff rather than throwing immediately, making `sendMessage` more resilient on flaky connections.
