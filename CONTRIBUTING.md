# Contributing to MCP Video

Thanks for your interest in contributing! MCP Video is an open-source Model Context Protocol server for video production, and we welcome contributions.

## Getting Started

1. Fork the repo and clone your fork
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run tests and submit a PR

```bash
git clone https://github.com/studiomeyer-io/mcp-video.git
cd mcp-video
npm install
npm run build
npm test
```

## Prerequisites

- **Node.js 18+**
- **FFmpeg** — installed and available in PATH (`ffmpeg -version`)
- **Playwright** — installed with browsers (`npx playwright install chromium`)

## Development

### Project Structure

```
src/
  tools/       — Tool implementations (40+ tools)
  services/    — FFmpeg, Playwright, TTS services
  transport/   — stdio + HTTP transport
scripts/       — Build and utility scripts
output/        — Generated files (gitignored)
```

### Commands

```bash
npm test          # Run all tests
npm run build     # Build TypeScript
npm start         # Start MCP server (stdio)
```

### Code Standards

- **TypeScript strict** — no exceptions
- **No `any`** — ever
- **Tests must pass** before any PR
- Tool implementations follow the MCP tool interface pattern

## Adding a Tool

1. Create your tool in `src/tools/`
2. Follow the existing tool pattern (input schema, handler, output)
3. Register it in the tool list
4. Add tests
5. Update the README with the new tool

## Pull Requests

1. Fork the repo and create a feature branch
2. Make your changes
3. Run `npm test`
4. Submit a PR with a clear description of what and why

## Reporting Security Issues

If you find a security vulnerability, please email security@studiomeyer.io instead of opening a public issue.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
