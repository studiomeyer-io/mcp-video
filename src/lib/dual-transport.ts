/**
 * Dual Transport for MCP Servers — Stdio + Streamable HTTP
 *
 * Default: stdio (backward compatible, used by Claude Code via subprocess)
 * --http: Streamable HTTP on configurable port (persistent HTTP microservice)
 *
 * Usage:
 *   startDualTransport(createMcpServer, { serverName, serverVersion, defaultPort })
 *
 * HTTP mode flags:
 *   --http           Enable HTTP transport
 *   --port=XXXX      Override default port
 *   MCP_HTTP=1       Enable via env var
 *   MCP_PORT=XXXX    Override port via env var
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

// ─── Types ───────────────────────────────────────────

/** Any MCP server that can connect to a transport */
type ConnectableServer = { connect(transport: unknown): Promise<void> };

/** Factory function that creates a fresh MCP server instance */
export type McpServerFactory = () => ConnectableServer;

export interface DualTransportOptions {
  serverName: string;
  serverVersion: string;
  /** Default HTTP port (used when --http is active) */
  defaultPort: number;
}

export interface TransportResult {
  type: 'stdio' | 'http';
  port?: number;
}

// ─── Detection ───────────────────────────────────────

function isHttpMode(): boolean {
  return (
    process.argv.includes('--http') ||
    process.env.MCP_HTTP === '1' ||
    process.env.MCP_HTTP === 'true'
  );
}

function getPort(defaultPort: number): number {
  const portArg = process.argv.find((a) => a.startsWith('--port='));
  if (portArg) {
    const parsed = parseInt(portArg.split('=')[1], 10);
    if (!isNaN(parsed)) return parsed;
  }
  if (process.env.MCP_PORT) {
    const parsed = parseInt(process.env.MCP_PORT, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return defaultPort;
}

// ─── Main Entry ──────────────────────────────────────

/**
 * Start an MCP server with dual transport support.
 *
 * @param createServer - Factory that creates a fresh MCP server (McpServer or Server)
 * @param options - Server name, version, and default HTTP port
 *
 * For stdio: creates one server, connects to StdioServerTransport.
 * For HTTP: creates a new server per session, connects to StreamableHTTPServerTransport.
 */
export async function startDualTransport(
  createServer: McpServerFactory,
  options: DualTransportOptions,
): Promise<TransportResult> {
  if (isHttpMode()) {
    return startHttpTransport(createServer, options);
  }
  return startStdioTransport(createServer, options);
}

// ─── Stdio Transport ─────────────────────────────────

async function startStdioTransport(
  createServer: McpServerFactory,
  options: DualTransportOptions,
): Promise<TransportResult> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(`${options.serverName} v${options.serverVersion} started (stdio)`);
  return { type: 'stdio' };
}

// ─── HTTP Transport ──────────────────────────────────

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  createdAt: number;
}

async function startHttpTransport(
  createServer: McpServerFactory,
  options: DualTransportOptions,
): Promise<TransportResult> {
  const port = getPort(options.defaultPort);
  const sessions = new Map<string, SessionEntry>();

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      await handleHttpRequest(req, res, sessions, createServer, options);
    } catch (err) {
      logger.logError('HTTP request error', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  const host = process.env.MCP_HOST || '127.0.0.1';
  httpServer.listen(port, host, () => {
    logger.info(`${options.serverName} v${options.serverVersion} started (HTTP on ${host}:${port})`);
  });

  // Session cleanup: remove stale sessions older than 30 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const staleThreshold = 30 * 60 * 1000;
    for (const [sid, session] of sessions) {
      if (now - session.createdAt > staleThreshold) {
        session.transport.close();
        sessions.delete(sid);
        logger.info(`Session expired: ${sid.slice(0, 8)}...`);
      }
    }
  }, 60_000);

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down HTTP transport...');
    clearInterval(cleanupInterval);
    for (const [, session] of sessions) {
      session.transport.close();
    }
    httpServer.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { type: 'http', port };
}

// ─── Request Handler ─────────────────────────────────

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  sessions: Map<string, SessionEntry>,
  createServer: McpServerFactory,
  options: DualTransportOptions,
): Promise<void> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, MCP-Session-ID');
  res.setHeader('Access-Control-Expose-Headers', 'MCP-Session-ID');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        server: options.serverName,
        version: options.serverVersion,
        transport: 'streamable-http',
        sessions: sessions.size,
      }),
    );
    return;
  }

  // MCP endpoint
  if (req.url === '/mcp') {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (req.method === 'POST') {
      const body = await parseBody(req);

      if (sessionId && sessions.has(sessionId)) {
        await sessions.get(sessionId)!.transport.handleRequest(req, res, body);
      } else if (!sessionId) {
        const mcpServer = createServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            sessions.set(sid, { transport, createdAt: Date.now() });
            logger.info(`Session created: ${sid.slice(0, 8)}... (${sessions.size} active)`);
          },
          onsessionclosed: (sid: string) => {
            sessions.delete(sid);
            logger.info(`Session closed: ${sid.slice(0, 8)}... (${sessions.size} active)`);
          },
        });

        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, body);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found', code: 'SESSION_NOT_FOUND' }));
      }
      return;
    }

    if (req.method === 'GET') {
      if (sessionId && sessions.has(sessionId)) {
        await sessions.get(sessionId)!.transport.handleRequest(req, res);
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing session ID', code: 'INVALID_SESSION' }));
      }
      return;
    }

    if (req.method === 'DELETE') {
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res);
        sessions.delete(sessionId);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found', code: 'SESSION_NOT_FOUND' }));
      }
      return;
    }
  }

  // 404 for anything else
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', code: 'NOT_FOUND' }));
}

// ─── Body Parser ─────────────────────────────────────

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      try {
        resolve(body ? JSON.parse(body) : undefined);
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', reject);
  });
}
