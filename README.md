# @sesamecare-oss/rate-limit

A simple wrapper around [node-rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible) that manages multiple instances of a rate limiter (for multiple keys on which to rate limit a single request, such as ip and username). @sesamecare-oss/rate-limit provides type sugar and some simpler centralized call mechanics.

See [__tests__/index.spec.ts] for sample usage.
