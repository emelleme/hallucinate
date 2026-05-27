import {
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

type Client = {
  id: number
  room: number
  socket: Bun.ServerWebSocket<Client>
  pose: SpawnPacket
}

const port = Number(process.env.PORT ?? 3001)
const rooms = Array.from({ length: roomCount }, () => new Set<Client>())
const clients = new Map<Bun.ServerWebSocket<Client>, Client>()
let nextId = 1

const server = Bun.serve<Client>({
  port,
  fetch(request, server) {
    if (server.upgrade(request)) {
      return
    }

    return new Response('club multiplayer')
  },
  websocket: {
    open(socket) {
      const id = nextId++
      const client: Client = {
        id,
        room: 0,
        socket,
        pose: {
          id,
          x: 0,
          y: 0,
          keys: 0,
          angle: 0,
          idleClipIndex: 0,
          style: {
            topStyleIndex: 1,
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
      const client = clients.get(socket)!

      clients.delete(socket)
      removeFromRoom(client)
    },
  },
})

console.log(`club multiplayer: ws://localhost:${server.port}`)

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
