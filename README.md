# HLR Fake Server

A fake HLR provider. It answers like a real HLR API, so HLR lookups can be tested without a provider account or cost. The answer depends on the number's last digit, so every scenario can be repeated on demand.

No dependencies. Node 18 or newer.

## Answers

| Last digit | Reply | Expected HLR result |
| --- | --- | --- |
| 1 (and 0, 8, 9) | Active, on Airtel | `active` |
| 2 | Switched off (`absent`) | `invalid` |
| 3 | Invalid number | `invalid` |
| 4 | HTTP 500 | `api_error` |
| 5 | HTTP 429 (Retry-After: 2) | `rate_limited` |
| 6 | Active, but only after 15 seconds | `timeout` |
| 7 | A reply in an unknown format | `unrecognized` |

A missing or wrong `x-api-key` header gives HTTP 401 (`api_error`).

The number can be sent in the query (`/hlr?msisdn=919876543211`), the path (`/hlr/919876543211`), or as `msisdn` in a JSON or form body (POST). A leading `+` is ignored. `GET /health` returns `{"status":"ok"}`.

## Settings (environment variables)

| Name | Default | Meaning |
| --- | --- | --- |
| `HLR_FAKE_API_KEY` | `fake-hlr-key` | The `x-api-key` value callers must send. Set your own value when the server is public. |
| `HLR_FAKE_DELAY_MS` | `15000` | The delay for numbers ending in 6. Keep it above 10000 (YeloConnect's time limit) to test timeouts. |
| `PORT` | `9900` | The port, for the Node server. Render sets it by itself. |

## Run locally

```bash
npm start        # http://localhost:9900/hlr
npm test         # 4 tests
```

```bash
curl -H "x-api-key: fake-hlr-key" "http://localhost:9900/hlr?msisdn=919876543211"
```

## Deploy on Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick this repo. `render.yaml` sets everything: a free web service, `node server.js`, and a `/health` check.
3. Set `HLR_FAKE_API_KEY` when Render asks.
4. The URL looks like `https://hlr-fake-server.onrender.com`.

Without the blueprint: **New → Web Service**, start command `node server.js`, no build command.

On the free plan the service sleeps when unused, so the first call after a while can take 30 to 60 seconds. YeloConnect may report that first call as a timeout; try again.

## Deploy on Vercel

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project**, import this repo. No framework, no build command.
3. Add `HLR_FAKE_API_KEY` under **Settings → Environment Variables**, then redeploy.
4. The URL looks like `https://hlr-fake-server.vercel.app`.

`vercel.json` sends every path to the function and allows up to 30 seconds per call, so the 15-second scenario works.

## HLR API settings in YeloConnect

Replace `<your-url>` with the Render or Vercel address (it must be `https://`, a public address) and the key with your `HLR_FAKE_API_KEY`.

- **API Base URL:** `https://<your-url>/hlr?msisdn={{mobile_number}}`
- **HTTP Method:** GET
- **Response Type:** JSON
- **Parameters:** header `x-api-key` = `fake-hlr-key`
- **Response sample:**

  ```json
  { "status": "ok", "result": { "msisdn": "919876543211", "state": "active", "network": "Airtel", "country": "IN", "mcc": "404", "mnc": "10", "ported": false, "reference": "fake-1" } }
  ```

- **Response mapping:** Success Key/Path `result.state`, Success Value `active`; Error Key/Path `result.state`, Error Values `absent` and `invalid`.

To send the number in the path instead, use `https://<your-url>/hlr/{msisdn}` and add a Path parameter `msisdn` = `{{mobile_number}}`.

Then click **Test** with a number ending in 1: the result is Active, and the API can be activated.
