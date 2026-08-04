import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { app } from 'electron';
import { WebSocketServer, WebSocket } from 'ws';
import type { OverlayMessage } from '../shared/contracts';
import type { CaptionManager } from './caption-manager';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

export class OverlayPortError extends Error {
  constructor(public readonly port: number) {
    super(`overlay_port_unavailable:${port}`);
  }
}

export class OverlayServer {
  private httpServer: Server | null = null;
  private webSocketServer: WebSocketServer | null = null;
  private clients = 0;
  private port = 0;
  private token = '';

  constructor(
    private readonly captionManager: CaptionManager,
    private readonly onClientCount: (count: number) => void,
  ) {}

  async start(port: number, token: string): Promise<void> {
    if (this.httpServer) return;
    this.port = port;
    this.token = token;
    this.webSocketServer = new WebSocketServer({ noServer: true });

    this.httpServer = createServer((request, response) => {
      void this.handleRequest(request.url ?? '/', response);
    });

    this.httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '/', this.url());
      if (url.pathname !== '/overlay-events' || !this.validToken(url.searchParams.get('token'))) {
        socket.destroy();
        return;
      }

      this.webSocketServer?.handleUpgrade(request, socket, head, (client) => {
        this.webSocketServer?.emit('connection', client, request);
      });
    });

    this.webSocketServer.on('connection', (client) => {
      this.clients += 1;
      this.onClientCount(this.clients);
      client.send(JSON.stringify(this.captionManager.snapshotMessage()));
      client.on('close', () => {
        this.clients = Math.max(0, this.clients - 1);
        this.onClientCount(this.clients);
      });
    });

    await new Promise<void>((resolve, reject) => {
      const server = this.httpServer;
      if (!server) return reject(new OverlayPortError(port));
      const onError = (error: NodeJS.ErrnoException) => {
        server.off('listening', onListening);
        reject(error.code === 'EADDRINUSE' ? new OverlayPortError(port) : error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    });
  }

  async stop(): Promise<void> {
    for (const client of this.webSocketServer?.clients ?? []) client.close();
    this.webSocketServer?.close();
    this.webSocketServer = null;
    const server = this.httpServer;
    this.httpServer = null;
    this.clients = 0;
    this.onClientCount(0);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  broadcast(message: OverlayMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.webSocketServer?.clients ?? []) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  overlayUrl(): string {
    return `${this.url()}/overlay?token=${encodeURIComponent(this.token)}`;
  }

  clientCount(): number {
    return this.clients;
  }

  private async handleRequest(rawUrl: string, response: import('node:http').ServerResponse) {
    const url = new URL(rawUrl, this.url());
    setSecurityHeaders(response);

    if (url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, clients: this.clients }));
      return;
    }

    if (url.pathname === '/overlay') {
      if (!this.validToken(url.searchParams.get('token'))) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }
      await this.serveFile('index.html', response);
      return;
    }

    if (url.pathname.startsWith('/overlay-assets/')) {
      const asset = decodeURIComponent(url.pathname.slice('/overlay-assets/'.length));
      if (!asset || asset.includes('..') || asset.includes('\\') || path.isAbsolute(asset)) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      await this.serveFile(asset, response);
      return;
    }

    response.writeHead(404);
    response.end('Not found');
  }

  private async serveFile(relativePath: string, response: import('node:http').ServerResponse) {
    try {
      const root = app.isPackaged
        ? path.join(process.resourcesPath, 'overlay-dist')
        : path.join(app.getAppPath(), 'resources', 'overlay-dist');
      const target = path.resolve(root, relativePath);
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('invalid_overlay_path');
      const body = await readFile(target);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(relativePath)] ?? 'application/octet-stream',
        'Cache-Control': relativePath.endsWith('.html') ? 'no-store' : 'public, max-age=86400',
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  }

  private validToken(candidate: string | null): boolean {
    if (!candidate) return false;
    const expected = Buffer.from(this.token);
    const received = Buffer.from(candidate);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }
}

function setSecurityHeaders(response: import('node:http').ServerResponse): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self' ws://127.0.0.1:*; img-src 'self'; style-src 'self'; font-src 'self'; script-src 'self'; frame-ancestors *",
  );
}
