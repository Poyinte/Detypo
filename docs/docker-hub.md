# Detypo — AI-Powered Bilingual PDF Proofreading

Detypo is a Chinese/English PDF proofreading tool that uses the DeepSeek API to automatically detect typos, grammar errors, punctuation mistakes, and non-compliant expressions. Results are overlaid as color-coded annotations on the original PDF for easy review.

Made with FastAPI, React 19, and shadcn/ui.

## Key Capabilities

- **Bilingual Proofreading** — Auto-detects document language and applies the correct rule set: Chinese (6 error categories) or English (4 categories based on Chicago Manual of Style, 18th ed.)
- **Extensible** — Add new languages by dropping in a rules file and registering it in `languages.json` — no code changes needed. CLI command `/add-language` automates the setup.
- **Dual View** — Review findings in a filterable table or card layout with page-by-page navigation
- **Selective Export** — Toggle individual corrections on/off before exporting the annotated PDF
- **Cost Preview** — Token estimation and cost breakdown before starting each proofread
- **SSE Streaming** — Real-time progress updates during LLM processing
- **UI Language** — Switch between Chinese and English interface from the sidebar
- **Dark Mode** — Light / dark / system-follow themes
- **Self-Hosted** — Runs entirely on your machine with your own DeepSeek API key

## Start Detypo in Docker

```bash
docker run -p 8520:8520 poyinte/detypo
```

Then open http://localhost:8520 and enter your DeepSeek API key in the setup dialog.

With a pre-configured API key:

```bash
docker run -p 8520:8520 -e DEEPSEEK_API_KEY=sk-xxx poyinte/detypo
```

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DEEPSEEK_API_KEY` | DeepSeek API key (can also be set in-app) | *(none)* |
| `HOST` | Server bind address | `0.0.0.0` |
| `PORT` | Server port | `8520` |

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
