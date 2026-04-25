---
"@vex-chat/libvex": patch
---

- **Security:** depend on `uuid@14.0.0+` to address [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) (buffer bounds in v3/v5/v6 with user-supplied `buf`).
