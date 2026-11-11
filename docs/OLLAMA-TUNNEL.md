# Ollama through Cloudflare Tunnel and Access

Status: cloudflared installed on this Mac. Ollama verified bound to 127.0.0.1:11434. Account login, hostname, Access policy, DNS route and external verification still require your Cloudflare authorization. No public endpoint or service token has been created yet.

A stable named tunnel with Access needs a domain using Cloudflare DNS. Quick trycloudflare.com tunnels are temporary development endpoints, not a substitute for this Access-protected setup. If you have no domain, add one to Cloudflare first. Do not expose Ollama using a quick tunnel while waiting.

## 1. Install and authorize

```bash
brew install cloudflared
cloudflared --version
cloudflared tunnel login
```

Authorize the domain in the opened browser. The account certificate is saved in ~/.cloudflared/cert.pem; keep it private.

Verify Ollama is local only:

```bash
lsof -nP -iTCP:11434 -sTCP:LISTEN
curl --fail http://127.0.0.1:11434/api/tags
```

Expect 127.0.0.1 (or ::1), never * / 0.0.0.0. Keep the existing loopback binding. Do not forward port 11434 on your router. If restarting Ollama manually rather than using its Mac app:

```bash
OLLAMA_HOST=127.0.0.1:11434 ollama serve
```

Do not start a second instance if it is already running.

## 2. Create the named tunnel

```bash
cloudflared tunnel create still-ollama
cloudflared tunnel list
```

Record the UUID from the create command; its credentials are ~/.cloudflared/UUID.json.

## 3. Protect the hostname BEFORE routing traffic

In Cloudflare Zero Trust:

1. Under Settings → Authentication → Login methods (or Integrations → Identity providers), enable One-time PIN, or select your existing identity provider.
2. Under Access → Applications → Add application → Self-hosted, create `Still Ollama`, hostname `ollama.YOUR_DOMAIN`, leaving Path empty to protect the whole hostname.
3. Add an Allow policy, Include → Emails → `baotduong91@gmail.com` (replace if desired). Choose One-time PIN as a login method. A login method is not an email allow-list; keep the explicit email rule.
4. Under Access → Service Auth → Service Tokens, create `Still Vercel`. Save its Client ID and Client Secret privately; the secret is shown only once. Choose an expiration you will maintain.
5. In the same application, add another policy with action Service Auth, Include → Service Token → `Still Vercel`. Do not use Bypass or Everyone. The token is an alternative machine identity; Vercel cannot complete an email login.
6. Save the application. Copy its Application Audience (AUD) tag and your team name (the prefix of TEAM.cloudflareaccess.com).

## 4. Write config and publish DNS

Replace the four placeholders, then paste this block. The config targets loopback and also requires a valid Access JWT at the tunnel connector.

```bash
export OLLAMA_TUNNEL_ID='REPLACE_WITH_TUNNEL_UUID'
export OLLAMA_HOSTNAME='ollama.REPLACE_WITH_YOUR_DOMAIN'
export CF_TEAM_NAME='REPLACE_WITH_TEAM_NAME'
export CF_ACCESS_AUD='REPLACE_WITH_APPLICATION_AUD'
mkdir -p "$HOME/.cloudflared"
chmod 700 "$HOME/.cloudflared"
# If config.yml already exists, merge this ingress rule rather than overwriting it.
test ! -e "$HOME/.cloudflared/config.yml" && cat > "$HOME/.cloudflared/config.yml" <<YAML
tunnel: ${OLLAMA_TUNNEL_ID}
credentials-file: ${HOME}/.cloudflared/${OLLAMA_TUNNEL_ID}.json

ingress:
  - hostname: ${OLLAMA_HOSTNAME}
    service: http://127.0.0.1:11434
    originRequest:
      httpHostHeader: localhost:11434
      access:
        required: true
        teamName: ${CF_TEAM_NAME}
        audTag:
          - ${CF_ACCESS_AUD}
  - service: http_status:404
YAML
chmod 600 "$HOME/.cloudflared/config.yml" "$HOME/.cloudflared/${OLLAMA_TUNNEL_ID}.json"
cloudflared tunnel ingress validate
cloudflared tunnel route dns "$OLLAMA_TUNNEL_ID" "$OLLAMA_HOSTNAME"
cloudflared tunnel run "$OLLAMA_TUNNEL_ID"
```

The final foreground command keeps running. In another Terminal window, test the URL. Do not start the connector until the Access application and its policies are saved. The fallback rule rejects unmatched hostnames. No change to OLLAMA_ORIGINS is needed for server-to-server requests.

## 5. Test authentication and inference

First, without credentials:

```bash
export OLLAMA_HOSTNAME='ollama.REPLACE_WITH_YOUR_DOMAIN'
curl -sS -D - -o /dev/null "https://${OLLAMA_HOSTNAME}/api/tags"
```

Expect an Access login redirect or denial, not Ollama JSON. Open that same /api/tags URL in a browser and authenticate with the allowed email; it should then show model JSON.

For a machine test, enter credentials without putting the secret in shell history:

```bash
read -r 'CF_ACCESS_CLIENT_ID?Access Client ID: '
read -rs 'CF_ACCESS_CLIENT_SECRET?Access Client Secret: '
export CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET
curl --fail-with-body "https://${OLLAMA_HOSTNAME}/api/tags" \
  -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" \
  -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}"
```

Use one returned model name below (no additional model download needed):

```bash
read -r 'OLLAMA_TEST_MODEL?Installed model name: '
curl --fail-with-body "https://${OLLAMA_HOSTNAME}/api/chat" \
  -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" \
  -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}" \
  -H 'Content-Type: application/json' \
  --data "{\"model\":\"${OLLAMA_TEST_MODEL}\",\"stream\":false,\"messages\":[{\"role\":\"user\",\"content\":\"Reply with hello.\"}]}"
unset CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET
```

Repeat a browser test on a phone using cellular data, with Wi-Fi off. A 403 often indicates Access policy/token mismatch; a 502 indicates the connector cannot reach Ollama; a Cloudflare timeout may mean the chosen model is too slow. Confirm both unauthenticated denial and authenticated success before relying on it.

## 6. Start on login

After the foreground test succeeds, stop it with Ctrl-C and install the official user launch agent (without sudo):

```bash
cloudflared service install
launchctl list | rg cloudflared
```

The official macOS installer uses ~/.cloudflared/config.yml and starts the tunnel on login. Choose this method OR Homebrew services, not both. Ollama must also start at login (enable its login item in macOS System Settings → General → Login Items). The Mac must remain powered, awake, logged in and online; login launch agents do not run before login. To uninstall the tunnel service:

```bash
cloudflared service uninstall
```

## 7. Still on Vercel

Use Vercel project `still` → Settings → Environment Variables → Production. Set these server-only values and redeploy:

```dotenv
OLLAMA_BASE_URL=https://ollama.YOUR_DOMAIN
OLLAMA_MODEL=YOUR_INSTALLED_MODEL_NAME
OLLAMA_ACCESS_CLIENT_ID=YOUR_SERVICE_TOKEN_CLIENT_ID
OLLAMA_ACCESS_CLIENT_SECRET=YOUR_SERVICE_TOKEN_CLIENT_SECRET
```

Store the secret as a sensitive/Secret variable. Never prefix these credentials with NEXT_PUBLIC_, put them in browser storage, or commit them. The provider and connection check now send the two Access headers server-side and reject redirects. This code must be deployed before those variables can work. Then choose Ollama in Still Settings and Check Ollama connection.

Call flow: browser → Still /api/ai → HTTPS Access gateway → tunnel → loopback Ollama. Direct browser fetches with service secrets are unsuitable. No browser CORS bypass or wildcard Ollama origins is required. A service token grants the Vercel server access independently of human email login. Protect access to the Still deployment itself if only you should trigger model calls: the in-app PIN is a local screen lock, not server authentication.

Generic server-side JavaScript:

```js
const response = await fetch(`${process.env.OLLAMA_BASE_URL}/api/chat`, {
  method: 'POST',
  redirect: 'error',
  headers: {
    'Content-Type': 'application/json',
    'CF-Access-Client-Id': process.env.OLLAMA_ACCESS_CLIENT_ID,
    'CF-Access-Client-Secret': process.env.OLLAMA_ACCESS_CLIENT_SECRET,
  },
  body: JSON.stringify({ model: process.env.OLLAMA_MODEL, stream: false,
    messages: [{ role: 'user', content: 'Hello' }] }),
});
if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
const result = await response.json();
```

Standard service tokens use the two CF-Access headers above, not Authorization: Bearer. A single Authorization header is optional only after explicitly configuring the Access application to read service tokens from that header; no need for it here.

## Official references

- https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/
- https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/as-a-service/macos/
- https://developers.cloudflare.com/tunnel/reference/origin-parameters/
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
