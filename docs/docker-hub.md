# Detypo — AI-Powered Bilingual PDF Proofreading

Detypo is a Chinese/English PDF proofreading tool that uses the DeepSeek API to automatically detect typos, grammar errors, punctuation mistakes, and non-compliant expressions. Results are overlaid as color-coded annotations on the original PDF for easy review.

<sub>Vibe Coding with DeepSeek V4</sub>

## Key Capabilities

- **Fast Proofreading** — Uses `deepseek-v4-flash` for quick and accurate error detection
- **Review and Filter** — Browse findings after proofreading, accept or reject individual items
- **Traceable Annotations** — Exported PDFs include detailed, locatable annotations for easy verification
- **Bilingual Support** — Auto-detects document language and switches to the corresponding rule set
- **Extensible** — Add new languages on your own

## Start Detypo in Docker

```bash
docker run -p 8520:8520 poyinte/detypo
```

> The server auto-selects an available port on startup if the default is occupied. For Docker, map the container port to match — use `-p 8520:8520` (or check startup log for the active port).

Then open the printed URL (default `http://localhost:8520`) and enter your DeepSeek API key in the setup dialog.

With a pre-configured API key:

```bash
docker run -p 8520:8520 -e DEEPSEEK_API_KEY=sk-xxx poyinte/detypo
```

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DEEPSEEK_API_KEY` | DeepSeek API key (can also be set in-app) | *(none)* |
| `HOST` | Server bind address | `0.0.0.0` (Docker) / `127.0.0.1` (local) |
| `PORT` | Preferred server port (auto-detects next available if busy) | `8520` |

## Changing the Port

To run on a different port, set the `PORT` environment variable and update the port mapping:

```bash
docker run -p 8080:8080 -e PORT=8080 poyinte/detypo
```

## Using Your Own API Key

Detypo does not bundle an API key — you bring your own DeepSeek API key. This means:

- You control your costs directly through your DeepSeek account
- No subscription, no third-party billing
- The key is stored in your browser's local storage and never leaves your machine

Get a key at [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys).

## Tags

| Tag | Description |
| :--- | :--- |
| `latest` | Latest stable release — **recommended for most users** |
| `v1` `v1.1` `v1.1.0` | Specific semver versions for pinned deployments |
| `v*` | Each pushed version tag triggers an automatic build via GitHub Actions |

```bash
# Use latest (always up to date)
docker run -p 8520:8520 poyinte/detypo:latest

# Pin to a specific version
docker run -p 8520:8520 poyinte/detypo:v1.1.0
```

## Updating

```bash
docker pull poyinte/detypo:latest
docker stop detypo && docker rm detypo
docker run -p 8520:8520 poyinte/detypo:latest
```

## Source Code

[github.com/Poyinte/Detypo](https://github.com/Poyinte/Detypo)

## License

GNU AGPL v3.0 — see [LICENSE](https://www.gnu.org/licenses/agpl-3.0.html).
