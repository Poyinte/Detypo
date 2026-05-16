<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![AGPL License][license-shield]][license-url]
[![Docker Pulls][docker-shield]][docker-url]



<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/Poyinte/Detypo">
    <img src="frontend/public/logo.svg" alt="Logo" width="80" height="64">
  </a>

  <h3 align="center">得误 Detypo</h3>

  <p align="center">
    AI-powered Chinese PDF proofreading tool
    <br />
    <br />
    <a href="https://github.com/Poyinte/Detypo"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/Poyinte/Detypo/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/Poyinte/Detypo/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>



<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about-the-project">About The Project</a></li>
    <li><a href="#built-with">Built With</a></li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#docker">Docker</a></li>
        <li><a href="#windows">Windows</a></li>
        <li><a href="#macos--linux">macOS / Linux</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

**得误 Detypo** is a Chinese-language PDF proofreading tool. Upload a PDF, extract text via PyMuPDF, send it to the DeepSeek API for proofreading (错别字, 标点, 用语规范, 禁用词), then overlay color-coded highlight annotations on the original PDF.

### Key Features

- **PDF Upload** — Drag & drop or click to select, with page range selection
- **Proofreading Categories** — Typos, word misuse, grammar, punctuation, number usage, sensitive terms
- **Dual View** — Table view for batch review, card view for detailed reading
- **Page-by-page Navigation** — Browse errors grouped by page with pagination
- **Export** — Toggle individual findings on/off, then export annotated PDF
- **Dark Mode** — Light / dark / system-follow
- **Token Estimation** — Preview cost and token usage before starting
- **Progress Tracking** — Real-time progress bar with fake-progress smoothing during LLM batches
- **SSE Streaming** — Live log updates during proofreading via Server-Sent Events

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- BUILT WITH -->
## Built With

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, PyMuPDF, SSE streaming |
| AI | DeepSeek API (deepseek-v4-flash) |
| Frontend | React 19, TypeScript, Vite |
| UI | shadcn/ui, Tailwind CSS 4, Radix UI |
| Packaging | Docker, Docker Compose |

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

### Prerequisites

- **DeepSeek API Key** — [Get one here](https://platform.deepseek.com/api_keys)

### Docker

```bash
docker run -p 3000:3000 poyinte/detypo
```

With API key pre-set:
```bash
docker run -p 3000:3000 -e DEEPSEEK_API_KEY=sk-xxx poyinte/detypo
```

Open http://localhost:3000. You can also enter the API key in the app settings.

### Windows

```bash
git clone git@github.com:Poyinte/Detypo.git
cd Detypo

# Double-click detypo.bat (production mode)
# Or in CMD:
detypo.bat              # Production mode (default)
detypo.bat dev          # Development mode (hot-reload)
detypo.bat stop         # Stop background services
```

Requires Python 3.10+ and Node.js 18+. Dependencies are auto-installed on first run.

### macOS / Linux

```bash
git clone git@github.com:Poyinte/Detypo.git
cd Detypo
chmod +x detypo

./detypo                # Production mode (default)
./detypo dev            # Development mode (hot-reload)
./detypo stop           # Stop background services
```

Requires Python 3.10+ and Node.js 18+. Dependencies are auto-installed on first run.

### Manual Setup

```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python server.py
# Open http://127.0.0.1:3000
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- USAGE -->
## Usage

1. Launch the app (Docker / bat / bash script)
2. Enter your DeepSeek API Key on the setup dialog or in sidebar settings
3. Upload a PDF — drag & drop or click to select
4. Select the page range you want to proofread
5. Click "Start Proofreading" — the app extracts text, sends it to DeepSeek, and streams results
6. Review findings in table or card view, toggle corrections on/off
7. Export the annotated PDF with color-coded highlights

### Page Range Selection

Before starting, you can select a subset of pages to proofread. The wizard shows page previews and estimates token usage and cost.

### Modes

| Command | Mode | Description |
|---|---|---|
| `detypo.bat` | Production | Builds frontend, single server on :3000 |
| `detypo.bat dev` | Development | Hot-reload backend + frontend on :4000 |
| `detypo.bat stop` | — | Stop all background services (dev mode only) |

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ROADMAP -->
## Roadmap

- [x] PDF upload with drag & drop
- [x] Page range selection with preview
- [x] Token & cost estimation
- [x] SSE streaming proofreading progress
- [x] Table + card dual view
- [x] Filter by error category
- [x] Export annotated PDF
- [x] Dark mode (light / dark / system)
- [x] Docker image
- [x] CI/CD (GitHub Actions → Docker Hub)
- [ ] Batch proofreading (multiple PDFs)
- [ ] Custom proofreading rules
- [ ] Multi-language UI (English, Japanese)

See the [open issues](https://github.com/Poyinte/Detypo/issues) for a full list.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTRIBUTING -->
## Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- LICENSE -->
## License

This project is licensed under the **GNU AGPL v3.0** — see the [LICENSE](https://www.gnu.org/licenses/agpl-3.0.html) for details.

> **Note:** AGPL is required by the PyMuPDF dependency. If you need a commercial license without copyleft restrictions, you can purchase a PyMuPDF commercial license from [Artifex](https://artifex.com/).

Other dependencies are under permissive licenses (MIT, BSD).

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

- [PyMuPDF](https://pymupdf.readthedocs.io/) — PDF rendering & annotation
- [FastAPI](https://fastapi.tiangolo.com/) — Backend framework
- [shadcn/ui](https://ui.shadcn.com/) — UI component system
- [DeepSeek](https://platform.deepseek.com/) — LLM API
- [Best-README-Template](https://github.com/othneildrew/Best-README-Template)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS -->
[contributors-shield]: https://img.shields.io/github/contributors/Poyinte/Detypo.svg?style=for-the-badge
[contributors-url]: https://github.com/Poyinte/Detypo/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/Poyinte/Detypo.svg?style=for-the-badge
[forks-url]: https://github.com/Poyinte/Detypo/network/members
[stars-shield]: https://img.shields.io/github/stars/Poyinte/Detypo.svg?style=for-the-badge
[stars-url]: https://github.com/Poyinte/Detypo/stargazers
[issues-shield]: https://img.shields.io/github/issues/Poyinte/Detypo.svg?style=for-the-badge
[issues-url]: https://github.com/Poyinte/Detypo/issues
[license-shield]: https://img.shields.io/github/license/Poyinte/Detypo.svg?style=for-the-badge
[license-url]: https://github.com/Poyinte/Detypo/blob/main/LICENSE
[docker-shield]: https://img.shields.io/docker/pulls/poyinte/detypo.svg?style=for-the-badge
[docker-url]: https://hub.docker.com/r/poyinte/detypo
