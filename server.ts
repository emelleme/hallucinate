import {
  C_HEARTBEAT,
  C_MOTION,
  C_ROOM_CHANGE,
  decodeClientMessage,
  decodeClientMotion,
  decodeRoomChange,
  encodeLeave,
  encodeRoomState,
  encodeServerMessage,
  encodeServerMotion,
  encodeSpawn,
  MESSAGE,
  roomCount,
  type SpawnPacket,
  truncateMessage,
} from './src/protocol.ts'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'

type Client = {
  id: number
  lastSeen: number
  room: number
  socket: Bun.ServerWebSocket<Client>
  pose: SpawnPacket
}

const port = Number(process.env.PORT ?? 3001)
const dist = join(import.meta.dir, 'dist')
const rooms = Array.from({ length: roomCount }, () => new Set<Client>())
const clients = new Map<Bun.ServerWebSocket<Client>, Client>()
const heartbeatInterval = 10_000
const clientTimeout = 30_000
let nextId = 1

const server = Bun.serve<Client>({
  port,
  async fetch(request, server) {
    if (server.upgrade(request)) {
      return
    }

    return serveStatic(request)
  },
  websocket: {
    open(socket) {
      const id = nextId++
      const client: Client = {
        id,
        lastSeen: Date.now(),
        room: 0,
        socket,
        pose: {
          id,
          x: 0,
          y: 0,
          keys: 0,
          angle: 0,
          idleClipIndex: 0,
          mode: 0,
          style: {
            topStyleIndex: 0,
            bottomStyleIndex: 0,
            hairIndex: 0,
            hairColorIndex: 0,
          },
        },
      }

      clients.set(socket, client)
      socket.data = client
      addToRoom(client, 0)
      sendRoomState(client)
      broadcast(client.room, encodeSpawn(client.pose), client)
    },
    message(socket, message) {
      const client = clients.get(socket)!
      const view = messageView(message)
      const type = view.getUint8(0)

      client.lastSeen = Date.now()

      if (type === C_HEARTBEAT) {
        return
      }

      if (type === C_MOTION) {
        const motion = decodeClientMotion(view)

        client.pose = { id: client.id, ...motion }
        broadcast(client.room, encodeServerMotion(client.pose), client)
        return
      }

      if (type === C_ROOM_CHANGE) {
        changeRoom(client, decodeRoomChange(view))
        return
      }

      if (type === MESSAGE) {
        const text = truncateMessage(decodeClientMessage(view))

        if (text) {
          broadcast(client.room, encodeServerMessage({ id: client.id, text }))
        }
      }
    },
    close(socket) {
      const client = clients.get(socket)

      if (!client) {
        return
      }

      clients.delete(socket)
      removeFromRoom(client)
    },
  },
})

console.log(`club multiplayer: ws://localhost:${server.port}`)
console.log(`club static: http://localhost:${server.port}`)

setInterval(syncRooms, heartbeatInterval)

async function serveStatic(request: Request) {
  const method = request.method

  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: {
        allow: 'GET, HEAD',
      },
    })
  }

  const url = new URL(request.url)
  const path = decodeURIComponent(url.pathname)
  const assetPath = path === '/' ? join(dist, 'index.html') : resolve(dist, `.${path}`)
  const assetRelativePath = relative(dist, assetPath)

  if (assetRelativePath.startsWith('..') || isAbsolute(assetRelativePath)) {
    throw new Error(`Invalid static path ${url.pathname}`)
  }

  const response = await fileResponse(assetPath, request)

  if (response) {
    return response
  }

  if (extname(path)) {
    return new Response('Not Found', { status: 404 })
  }

  return await fileResponse(join(dist, 'index.html'), request) ?? new Response('Not Found', { status: 404 })
}

async function fileResponse(path: string, request: Request) {
  const file = Bun.file(path)

  if (!await file.exists()) {
    return
  }

  const headers = cacheHeaders(path)
  const modified = new Date(file.lastModified)
  const tag = `"${file.size.toString(16)}-${file.lastModified.toString(16)}"`

  headers.set('content-type', file.type || contentType(path))
  headers.set('content-length', String(file.size))
  headers.set('etag', tag)
  headers.set('last-modified', modified.toUTCString())

  if (request.headers.get('if-none-match') === tag) {
    headers.delete('content-length')
    return new Response(null, { status: 304, headers })
  }

  if (request.method === 'HEAD') {
    return new Response(null, { headers })
  }

  return new Response(file, { headers })
}

function cacheHeaders(path: string) {
  const headers = new Headers()

  headers.set('x-content-type-options', 'nosniff')

  if (path.endsWith('index.html')) {
    headers.set('cache-control', 'no-cache')
    return headers
  }

  if (/[/\\]assets[/\\].+-[A-Za-z0-9_-]{8,}\./.test(path)) {
    headers.set('cache-control', 'public, max-age=31536000, immutable')
    return headers
  }

  headers.set('cache-control', 'public, max-age=3600')

  return headers
}

function contentType(path: string) {
  const type = contentTypes.get(extname(path))

  if (!type) {
    throw new Error(`Missing content type for ${path}`)
  }

  return type
}

const contentTypes = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.fbx', 'application/octet-stream'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
])

function changeRoom(client: Client, room: number) {
  if (room < 0 || room >= roomCount) {
    throw new Error(`Invalid room ${room}`)
  }

  if (client.room === room) {
    sendRoomState(client)
    return
  }

  removeFromRoom(client)
  addToRoom(client, room)
  sendRoomState(client)
  broadcast(client.room, encodeSpawn(client.pose), client)
}

function addToRoom(client: Client, room: number) {
  client.room = room
  rooms[room]!.add(client)
}

function removeFromRoom(client: Client) {
  rooms[client.room]!.delete(client)
  broadcast(client.room, encodeLeave(client.id))
}

function sendRoomState(client: Client) {
  client.socket.send(encodeRoomState({
    selfId: client.id,
    room: client.room,
    players: [...rooms[client.room]!.values()].map(player => player.pose),
  }))
}

function syncRooms() {
  const now = Date.now()

  for (const client of clients.values()) {
    if (now - client.lastSeen > clientTimeout) {
      clients.delete(client.socket)
      removeFromRoom(client)
      client.socket.close(1001, 'timeout')
    }
  }

  for (const client of clients.values()) {
    sendRoomState(client)
  }
}

function broadcast(room: number, data: ArrayBuffer, except?: Client) {
  for (const client of rooms[room]!) {
    if (client !== except) {
      client.socket.send(data)
    }
  }
}

function messageView(message: string | Buffer) {
  if (typeof message === 'string') {
    throw new Error('Expected binary websocket message')
  }

  return new DataView(message.buffer, message.byteOffset, message.byteLength)
}
