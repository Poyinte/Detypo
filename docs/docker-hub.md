# Detypo — AI-Powered Chinese PDF Proofreading

Detypo is a Chinese-language PDF proofreading tool that uses the DeepSeek API to automatically detect typos, grammar errors, punctuation mistakes, and non-compliant expressions. Results are overlaid as color-coded annotations on the original PDF for easy review.

Made with FastAPI, React 19, and shadcn/ui.

## Key Capabilities

- **AI Proofreading** — Detects 6 categories of errors: character misuse, word misuse, grammar, punctuation, number formatting, and sensitive terms
- **Dual View** — Review findings in a filterable table or card layout with page-by-page navigation
- **Selective Export** — Toggle individual corrections on/off before exporting the annotated PDF
- **Cost Preview** — Token estimation and cost breakdown before starting each proofread
- **SSE Streaming** — Real-time progress updates during LLM processing
- **Dark Mode** — Light / dark / system-follow themes
- **Self-Hosted** — Runs entirely on your machine with your own DeepSeek API key

## Start Detypo in Docker

```bash
docker run -p 3000:3000 poyinte/detypo
```

Then open http://localhost:3000 and enter your DeepSeek API key in the setup dialog.

With a pre-configured API key:

```bash
docker run -p 3000:3000 -e DEEPSEEK_API_KEY=sk-xxx poyinte/detypo
```

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DEEPSEEK_API_KEY` | DeepSeek API key (can also be set in-app) | *(none)* |
| `HOST` | Server bind address | `0.0.0.0` |
| `PORT` | Server port | `3000` |

## Using Your Own API Key

Detypo does not bundle an API key — you bring your own DeepSeek API key. This means:

- You control your costs directly through your DeepSeek account
- No subscription, no third-party billing
- The key is stored in your browser's local storage and never leaves your machine

Get a key at [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys).

## Updating

Pull the latest image:

```bash
docker pull poyinte/detypo:latest
```

Then stop and recreate your container:

```bash
docker stop detypo && docker rm detypo
docker run -p 3000:3000 poyinte/detypo
```

## Source Code

[github.com/Poyinte/Detypo](https://github.com/Poyinte/Detypo)

## License

GNU AGPL v3.0 — see [LICENSE](https://www.gnu.org/licenses/agpl-3.0.html).
