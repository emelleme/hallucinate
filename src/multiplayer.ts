import * as Ably from 'ably'
import { characterFloor } from './character-data.ts'
import { resolvePlayerStyle } from './character-style.ts'
import { lengthSq } from './math.ts'
import {
  ACTION_BUBBLING,
  ACTION_FOAMING,
  ACTIONS,
  angleToProtocol,
  BEACH_BALLS,
  type ClientMessagePacket,
  decodeBeachBalls,
  decodeDuckPosition,
  decodeGraffiti,
  decodeKeys,
  decodeLeave,
  decodeModerationMessage,
  decodeOnline,
  decodeRoomState,
  decodeServerActions,
  decodeServerMessage,
  decodeServerMotion,
  decodeServerProfile,
  decodeSpawn,
  decodeVideoPlaylistRequest,
  decodeVideoSync,
  encodeAdminMessage,
  encodeBeachBalls,
  encodeClientActions,
  encodeDuckPosition,
  encodeClientMessage,
  encodeClientMotion,
  encodeClientProfile,
  encodeEnter,
  encodeGraffiti,
  encodeHeartbeat,
  encodeKeys,
  encodeRoomChange,
  encodeVideoPlaylist,
  encodeVideoSync,
  GRAFFITI,
  DUCK_POSITION,
  type GraffitiPacket,
  MESSAGE,
  type MessagePacket,
  MODERATION,
  modeToProtocol,
  NICKNAME,
  type OnlinePacket,
  type ProfilePacket,
  protocolToAngle,
  protocolToMode,
  protocolToScene,
  protocolVersion,
  S_LEAVE,
  S_MOTION,
  S_ONLINE,
  S_ROOM_STATE,
  S_SPAWN,
  sceneToProtocol,
  type SpawnPacket,
  truncateMessage,
  VIDEO_PLAYLIST_REQUEST,
  VIDEO_SYNC,
  type VideoPlaylistEntry,
  type VideoPlaylistRequestPacket,
  type VideoSyncPacket,
  type VideoSyncEntry,
  decodeClientActions,
  decodeClientMessage,
  C_MOTION,
  decodeClientMotion,
} from './protocol.ts'
import type { DuckPose } from './duck-position.ts'
import { collideRoom, isOutside, seatAt, walkHeight } from './scene.ts'
import type { BeachBall, CharacterMode, CircleBounds, GraffitiSplat, Player, Vec3 } from './types.ts'

const waveOutDuration = (95 - 62) / 30
const breakdanceDuration = 201 / 30

function hashStringToInt(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) || 1
}

const ablyKey = (typeof localStorage !== 'undefined' && localStorage.getItem('ably_key')) || (import.meta.env && import.meta.env.VITE_ABLY_KEY)

export function createMultiplayer(options: {
  localPosition: Vec3
  localTurn: () => number
  localMoveAngle: () => number
  localInput: Vec3
  localMode: () => CharacterMode
  localIdleClipIndex: () => number
  localSunglasses: () => boolean
  localActions: () => number
  localActionTurn: () => number
  localInstagram: () => string
  localNickname: () => string
  localEntered: () => boolean
  localProfileReady: () => boolean
  localStyle: () => {
    topStyleIndex: number
    bottomStyleIndex: number
    hairIndex: number
    hairColorIndex: number
    skinColorIndex: number
    accessoryIndex: number
  }
  getGraffitiSplats?: () => GraffitiSplat[]
  getBeachBalls?: () => BeachBall[]
  getDuckPose?: () => DuckPose
  getVideoSyncEntries?: () => VideoSyncEntry[]
  initialRoom: number
  spaceSlug?: string
  onRoomState: (room: number, state: { selfChanged: boolean }) => void
  onMessage: (message: MessagePacket) => void
  onProfile: (profile: ProfilePacket) => void
  onDeleteMessages: (id: number) => void
  onLeave: (id: number) => void
  onOnlineCount: (online: OnlinePacket) => void
  onVideoPlaylistRequest: (zones: VideoPlaylistRequestPacket['zones']) => void
  onVideoSync: (packet: VideoSyncPacket) => void
  onBeachBalls: (balls: BeachBall[]) => void
  onDuckPosition: (pose: DuckPose) => void
  onGraffiti: (packet: GraffitiPacket) => void
}) {
  const players = new Map<number, Player>()
  const pendingPlayers = new Map<number, SpawnPacket>()
  const profiledPlayers = new Set<number>()
  const playerNicknames = new Map<number, string>()
  const playerInstagrams = new Map<number, string>()
  const roomConnectionIds = new Set<string>()

  const heartbeatInterval = 5_000
  const reconnectDelay = 1_500
  let heartbeat: any
  let reconnect: any
  let closed = false
  let connectedOnce = false
  const pending: ArrayBuffer[] = []
  let selfId = 0
  let room = options.initialRoom
  let lastKeys = -1
  let lastAngle = -1
  let lastMode = -1
  let lastHeight = Infinity
  let lastActions = -1
  let lastActionAngle = -1
  let profileQueued = false
  let socket: WebSocket | undefined
  let useAbly = false
  let hostSyncInterval: any

  let ablyClient: Ably.Realtime | undefined
  let currentChannel: Ably.RealtimeChannel | undefined

  function isHost() {
    if (!ablyClient || !ablyClient.connection.id) return false
    const sorted = Array.from(roomConnectionIds).sort()
    return sorted[0] === ablyClient.connection.id
  }

  function getPresenceData() {
    const mode = options.localMode()
    const protocolMode = modeToProtocol(mode)
    const seated = mode === 'manSitting' || mode === 'womanSitting'
    const keys = seated ? 0 : encodeKeys(options.localInput)
    const angle = angleToProtocol(keys === 0 ? options.localTurn() : options.localMoveAngle())
    const height = sceneToProtocol(options.localPosition[1])

    return {
      nick: options.localNickname(),
      insta: options.localInstagram(),
      style: options.localStyle(),
      sunglasses: options.localSunglasses(),
      x: sceneToProtocol(options.localPosition[0]),
      y: sceneToProtocol(options.localPosition[2]),
      height,
      angle,
      mode: protocolMode,
      idleClipIndex: options.localIdleClipIndex(),
      keys,
    }
  }

  async function switchRoomAbly(nextRoom: number) {
    if (!ablyClient) return

    if (currentChannel) {
      try {
        await currentChannel.presence.leave()
        currentChannel.unsubscribe()
        currentChannel.presence.unsubscribe()
        currentChannel.detach()
      } catch (e) {
        // ignore detach errors
      }
    }

    if (hostSyncInterval) {
      clearInterval(hostSyncInterval)
    }

    roomConnectionIds.clear()
    if (ablyClient.connection.id) {
      roomConnectionIds.add(ablyClient.connection.id)
    }

    room = nextRoom
    const channelName = `${options.spaceSlug || 'default'}:room:${nextRoom}`
    const channel = ablyClient.channels.get(channelName)
    currentChannel = channel

    channel.subscribe((message) => {
      if (message.connectionId === ablyClient!.connection.id) {
        return
      }

      if (message.name === 'sync-request') {
        if (isHost() && currentChannel) {
          if (options.getDuckPose) {
            currentChannel.publish('duck', encodeDuckPosition(options.getDuckPose()))
          }
          if (options.getBeachBalls) {
            currentChannel.publish('beachballs', encodeBeachBalls({ balls: options.getBeachBalls() }))
          }
          if (options.getGraffitiSplats) {
            currentChannel.publish('graffiti', encodeGraffiti({ splats: options.getGraffitiSplats() }))
          }
          if (options.getVideoSyncEntries) {
            currentChannel.publish('videosync', encodeVideoSync({
              serverTime: Date.now(),
              entries: options.getVideoSyncEntries()
            }))
          }
        }
        return
      }

      const playerId = hashStringToInt(message.connectionId!)
      const view = new DataView(message.data as ArrayBuffer)

      if (message.name === 'videosync') {
        options.onVideoSync(decodeVideoSync(view))
        return
      }

      const type = view.getUint8(0)

      if (type === C_MOTION) {
        const motion = decodeClientMotion(view)
        const packet: SpawnPacket = {
          id: playerId,
          ...motion
        }
        if (validRemotePose(packet)) {
          let player = players.get(playerId)
          if (!player) {
            const nick = playerNicknames.get(playerId) || 'Guest'
            const insta = playerInstagrams.get(playerId) || ''
            player = createRemotePlayer(packet)
            players.set(playerId, player)
            options.onProfile({ id: playerId, nick, insta })
          } else {
            applyRemotePose(player, packet)
          }
        }
      } else if (type === ACTIONS) {
        const packet = decodeClientActions(view)
        const player = players.get(playerId)
        if (player) {
          player.actionTurn = protocolToAngle(packet.angle)
          player.bubbling = (packet.actions & ACTION_BUBBLING) !== 0
          player.foaming = (packet.actions & ACTION_FOAMING) !== 0
        }
      } else if (type === MESSAGE) {
        const clientMsg = decodeClientMessage(view)
        const nick = playerNicknames.get(playerId) || 'Guest'
        const insta = playerInstagrams.get(playerId) || ''
        options.onMessage({
          id: playerId,
          nick,
          insta,
          photoTimestamp: clientMsg.photoTimestamp,
          text: clientMsg.text
        })
      } else if (type === GRAFFITI) {
        options.onGraffiti(decodeGraffiti(view))
      } else if (type === BEACH_BALLS) {
        options.onBeachBalls(decodeBeachBalls(view).balls)
      } else if (type === DUCK_POSITION) {
        options.onDuckPosition(decodeDuckPosition(view))
      }
    })

    channel.presence.subscribe((presenceMsg) => {
      const connId = presenceMsg.connectionId!
      const playerId = hashStringToInt(connId)
      if (playerId === selfId) return

      if (presenceMsg.action === 'enter' || presenceMsg.action === 'present' || presenceMsg.action === 'update') {
        roomConnectionIds.add(connId)
        const data = presenceMsg.data
        if (data) {
          if (data.nick) playerNicknames.set(playerId, data.nick)
          if (data.insta) playerInstagrams.set(playerId, data.insta)

          options.onProfile({
            id: playerId,
            nick: data.nick || 'Guest',
            insta: data.insta || ''
          })

          if (data.x !== undefined && data.y !== undefined) {
            const packet: SpawnPacket = {
              id: playerId,
              x: data.x,
              y: data.y,
              height: data.height ?? 0,
              keys: data.keys ?? 0,
              angle: data.angle ?? 0,
              idleClipIndex: data.idleClipIndex ?? 0,
              mode: data.mode ?? 0,
              style: data.style ?? {
                topStyleIndex: 0,
                bottomStyleIndex: 0,
                hairIndex: 0,
                hairColorIndex: 0,
                skinColorIndex: 0,
                accessoryIndex: 0,
              },
              sunglasses: data.sunglasses ?? false
            }
            let player = players.get(playerId)
            if (!player) {
              player = createRemotePlayer(packet)
              players.set(playerId, player)
            } else {
              applyRemotePose(player, packet)
            }
          }
        }
      } else if (presenceMsg.action === 'leave') {
        roomConnectionIds.delete(connId)
        removeRemotePlayer(playerId, true)
      }
    })

    try {
      await channel.presence.enter(getPresenceData())
    } catch (e) {
      // ignore presence enter errors
    }

    try {
      const members = await channel.presence.get()
      for (const member of members) {
        const connId = member.connectionId!
        roomConnectionIds.add(connId)
        const playerId = hashStringToInt(connId)
        if (playerId === selfId) continue

        const data = member.data
        if (data) {
          if (data.nick) playerNicknames.set(playerId, data.nick)
          if (data.insta) playerInstagrams.set(playerId, data.insta)

          options.onProfile({
            id: playerId,
            nick: data.nick || 'Guest',
            insta: data.insta || ''
          })

          if (data.x !== undefined && data.y !== undefined) {
            const packet: SpawnPacket = {
              id: playerId,
              x: data.x,
              y: data.y,
              height: data.height ?? 0,
              keys: data.keys ?? 0,
              angle: data.angle ?? 0,
              idleClipIndex: data.idleClipIndex ?? 0,
              mode: data.mode ?? 0,
              style: data.style ?? {
                topStyleIndex: 0,
                bottomStyleIndex: 0,
                hairIndex: 0,
                hairColorIndex: 0,
                skinColorIndex: 0,
                accessoryIndex: 0,
              },
              sunglasses: data.sunglasses ?? false
            }
            let player = players.get(playerId)
            if (!player) {
              player = createRemotePlayer(packet)
              players.set(playerId, player)
            }
          }
        }
      }
    } catch (e) {
      // ignore presence get errors
    }

    if (!isHost()) {
      channel.publish('sync-request', '')
    }

    hostSyncInterval = setInterval(() => {
      if (isHost() && currentChannel) {
        if (options.getDuckPose) {
          currentChannel.publish('duck', encodeDuckPosition(options.getDuckPose()))
        }
        if (options.getBeachBalls) {
          currentChannel.publish('beachballs', encodeBeachBalls({ balls: options.getBeachBalls() }))
        }
        if (options.getGraffitiSplats) {
          currentChannel.publish('graffiti', encodeGraffiti({ splats: options.getGraffitiSplats() }))
        }
        if (options.getVideoSyncEntries) {
          currentChannel.publish('videosync', encodeVideoSync({
            serverTime: Date.now(),
            entries: options.getVideoSyncEntries()
          }))
        }
      }
    }, 5_000)

    options.onRoomState(nextRoom, { selfChanged: false })
  }

  function startAbly(key?: string, tokenRequest?: any) {
    const opts: any = key ? { key } : {
      authCallback: async (data: any, callback: any) => {
        try {
          const res = await fetch('/api/ably-token?clientId=' + encodeURIComponent(data.clientId || ''))
          const req = await res.json()
          callback(null, req)
        } catch (err: any) {
          callback(err, null)
        }
      }
    }

    ablyClient = new Ably.Realtime(opts)

    ablyClient.connection.on('connected', () => {
      connectedOnce = true
      const prevSelfId = selfId
      selfId = hashStringToInt(ablyClient!.connection.id!)
      options.onRoomState(room, { selfChanged: selfId !== prevSelfId })
      switchRoomAbly(room)
    })

    ablyClient.connection.on('failed', () => {
      if (!connectedOnce && !closed) {
        useAbly = false
        socket = connectWs()
      }
    })
  }

  async function init() {
    if (ablyKey) {
      useAbly = true
      startAbly(ablyKey)
      return
    }

    try {
      const res = await fetch('/api/ably-token?clientId=client_' + Math.random().toString(36).substring(2, 11))
      if (res.ok) {
        const tokenRequest = await res.json()
        if (tokenRequest && !tokenRequest.error) {
          useAbly = true
          startAbly(undefined, tokenRequest)
          return
        }
      }
    } catch (e) {
      // Ignore and fallback
    }

    useAbly = false
    socket = connectWs()
  }

  function connectWs() {
    const next = new WebSocket(connectUrl(connectedOnce))

    next.binaryType = 'arraybuffer'
    next.addEventListener('open', () => {
      connectedOnce = true
      clearTimeout(reconnect)
      heartbeat = setInterval(() => sendWs(encodeHeartbeat()), heartbeatInterval)
      room = options.initialRoom
      lastActions = -1
      lastActionAngle = -1
      sendMotion()
      if (options.localProfileReady() && !profileQueued) {
        sendProfile()
      }
      sendWs(encodeRoomChange(room))
      if (options.localEntered()) {
        sendEnter()
      }
      flushWs()
    })
    next.addEventListener('close', event => {
      clearInterval(heartbeat)

      if (event.code === 1012 && event.reason === 'version') {
        location.reload()
        return
      }

      if (!closed) {
        reconnect = setTimeout(() => {
          socket = connectWs()
        }, reconnectDelay)
      }
    })
    next.addEventListener('message', receiveWs)

    return next
  }

  function connectUrl(reconnect: boolean) {
    const base = location.protocol === 'https:'
      ? location.origin.replace(/^http/, 'ws')
      : `ws://${location.hostname}:3001`

    const space = options.spaceSlug ? `&space=${encodeURIComponent(options.spaceSlug)}` : ''

    return `${base}?protocol=${protocolVersion}&session=${reconnect ? 'reconnect' : 'init'}${space}`
  }

  function receiveWs(event: MessageEvent<ArrayBuffer>) {
    const view = new DataView(event.data as ArrayBuffer)
    const type = view.getUint8(0)

    if (type === S_ROOM_STATE) {
      const state = decodeRoomState(view)
      const previousSelfId = selfId
      const previousRoom = room
      const previousIds = new Set(players.keys())
      const previousPendingIds = new Set(pendingPlayers.keys())

      selfId = state.selfId
      room = state.room
      removeRemotePlayer(selfId, true)
      previousIds.delete(selfId)
      previousPendingIds.delete(selfId)

      for (const player of state.players) {
        if (player.id !== selfId && applyRemotePlayerPacket(player)) {
          previousIds.delete(player.id)
          previousPendingIds.delete(player.id)
        }
      }

      for (const id of previousIds) {
        removeRemotePlayer(id, true)
      }
      for (const id of previousPendingIds) {
        removeRemotePlayer(id, false)
      }

      if (selfId !== previousSelfId || room !== previousRoom) {
        options.onRoomState(room, { selfChanged: selfId !== previousSelfId })
      }

      return
    }

    if (type === S_SPAWN) {
      const packet = decodeSpawn(view)

      if (packet.id !== selfId) {
        applyRemotePlayerPacket(packet)
      }

      return
    }

    if (type === S_MOTION) {
      const packet = decodeServerMotion(view)

      if (packet.id === selfId) {
        return
      }

      const player = players.get(packet.id)

      if (player && validRemotePose(packet)) {
        applyRemotePose(player, packet)
      }
      else {
        applyRemotePlayerPacket(packet)
      }

      return
    }

    if (type === S_LEAVE) {
      const id = decodeLeave(view)

      if (id !== selfId) {
        removeRemotePlayer(id, true)
      }
      return
    }

    if (type === S_ONLINE) {
      options.onOnlineCount(decodeOnline(view))
      return
    }

    if (type === VIDEO_SYNC) {
      options.onVideoSync(decodeVideoSync(view))
      return
    }

    if (type === VIDEO_PLAYLIST_REQUEST) {
      options.onVideoPlaylistRequest(decodeVideoPlaylistRequest(view).zones)
      return
    }

    if (type === BEACH_BALLS) {
      options.onBeachBalls(decodeBeachBalls(view).balls)
      return
    }

    if (type === DUCK_POSITION) {
      options.onDuckPosition(decodeDuckPosition(view))
      return
    }

    if (type === GRAFFITI) {
      options.onGraffiti(decodeGraffiti(view))
      return
    }

    if (type === MESSAGE) {
      const message = decodeServerMessage(view)

      options.onMessage(message)
      return
    }

    if (type === NICKNAME) {
      const profile = decodeServerProfile(view)

      if (profile.id !== selfId) {
        profiledPlayers.add(profile.id)
        promotePendingPlayer(profile.id)
      }
      options.onProfile(profile)
      return
    }

    if (type === ACTIONS) {
      const packet = decodeServerActions(view)

      if (packet.id === selfId) {
        return
      }

      const player = players.get(packet.id)

      if (player) {
        player.actionTurn = protocolToAngle(packet.angle)
        player.bubbling = (packet.actions & ACTION_BUBBLING) !== 0
        player.foaming = (packet.actions & ACTION_FOAMING) !== 0
      }

      return
    }

    if (type === MODERATION) {
      const message = decodeModerationMessage(view)

      if (message.command === 'deleteMessages') {
        options.onDeleteMessages(message.id)
      }
    }
  }

  function sendWs(data: ArrayBuffer) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(data)
    }
  }

  function queueWs(data: ArrayBuffer) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(data)
    }
    else {
      pending.push(data)
    }
  }

  function flushWs() {
    while (pending.length) {
      socket!.send(pending.shift()!)
    }

    profileQueued = false
  }

  function applyRemotePlayerPacket(packet: SpawnPacket) {
    if (!validRemotePose(packet)) {
      return false
    }

    const player = players.get(packet.id)

    if (player) {
      applyRemotePose(player, packet)
    }
    else if (profiledPlayers.has(packet.id)) {
      players.set(packet.id, createRemotePlayer(packet))
    }
    else {
      pendingPlayers.set(packet.id, packet)
    }

    return true
  }

  function promotePendingPlayer(id: number) {
    const packet = pendingPlayers.get(id)

    if (packet) {
      pendingPlayers.delete(id)
      players.set(id, createRemotePlayer(packet))
    }
  }

  function removeRemotePlayer(id: number, notify: boolean) {
    const removed = players.delete(id)

    pendingPlayers.delete(id)
    profiledPlayers.delete(id)
    playerNicknames.delete(id)
    playerInstagrams.delete(id)
    if (removed && notify) {
      options.onLeave(id)
    }
  }

  function sendRoomChange(nextRoom: number) {
    if (useAbly) {
      switchRoomAbly(nextRoom)
    } else {
      room = nextRoom
      sendWs(encodeRoomChange(nextRoom))
    }
  }

  function sendMessage(text: string, photoTimestamp = 0) {
    const next = truncateMessage(text)

    if (next || photoTimestamp) {
      const packet: ClientMessagePacket = { photoTimestamp, text: next }

      if (useAbly) {
        if (currentChannel) {
          currentChannel.publish('msg', encodeClientMessage(packet))
        }
      } else {
        queueWs(encodeClientMessage(packet))
      }

      return packet
    }
  }

  function sendProfile() {
    if (useAbly) {
      if (currentChannel) {
        currentChannel.presence.update(getPresenceData())
      }
    } else {
      const data = encodeClientProfile({ insta: options.localInstagram(), nick: options.localNickname() })

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(data)
      }
      else {
        pending.push(data)
        profileQueued = true
      }
    }
  }

  function sendEnter() {
    if (useAbly) {
      if (currentChannel) {
        currentChannel.presence.enter(getPresenceData())
      }
    } else {
      sendWs(encodeEnter())
    }
  }

  function sendAdmin(pass: string, command: 'ban' | 'banSubnet' | 'randomTrack' | 'resetObjects', id: number) {
    if (useAbly) {
      if (currentChannel) {
        currentChannel.publish('admin', encodeAdminMessage({ pass, command, id }))
      }
    } else {
      queueWs(encodeAdminMessage({ pass, command, id }))
    }
  }

  function sendMotion() {
    const mode = options.localMode()
    const protocolMode = modeToProtocol(mode)
    const seated = mode === 'manSitting' || mode === 'womanSitting'
    const keys = seated ? 0 : encodeKeys(options.localInput)
    const angle = angleToProtocol(keys === 0 ? options.localTurn() : options.localMoveAngle())
    const height = sceneToProtocol(options.localPosition[1])

    const motionPacket = {
      x: sceneToProtocol(options.localPosition[0]),
      y: sceneToProtocol(options.localPosition[2]),
      height,
      keys,
      angle,
      idleClipIndex: options.localIdleClipIndex(),
      mode: protocolMode,
      style: options.localStyle(),
      sunglasses: options.localSunglasses(),
    }

    if (useAbly) {
      if (currentChannel) {
        currentChannel.publish('motion', encodeClientMotion(motionPacket))
      }
    } else {
      sendWs(encodeClientMotion(motionPacket))
    }
    lastKeys = keys
    lastAngle = angle
    lastMode = protocolMode
    lastHeight = height
  }

  function sendActionsIfChanged() {
    const actions = options.localActions()
    const angle = angleToProtocol(options.localActionTurn())

    if (actions !== lastActions || (actions !== 0 && angle !== lastActionAngle)) {
      lastActions = actions
      lastActionAngle = angle
      if (useAbly) {
        if (currentChannel) {
          currentChannel.publish('actions', encodeClientActions({ actions, angle }))
        }
      } else {
        sendWs(encodeClientActions({ actions, angle }))
      }
    }
  }

  function sendVideoPlaylist(entries: VideoPlaylistEntry[]) {
    if (useAbly) {
      if (currentChannel) {
        currentChannel.publish('playlist', encodeVideoPlaylist({ entries }))
      }
    } else {
      sendWs(encodeVideoPlaylist({ entries }))
    }
  }

  function sendBeachBalls(balls: BeachBall[]) {
    if (useAbly) {
      if (currentChannel) {
        currentChannel.publish('beachballs', encodeBeachBalls({ balls }))
      }
    } else {
      sendWs(encodeBeachBalls({ balls }))
    }
  }

  function sendDuckPosition(pose: DuckPose) {
    if (useAbly) {
      if (currentChannel) {
        currentChannel.publish('duck', encodeDuckPosition(pose))
      }
    } else {
      sendWs(encodeDuckPosition(pose))
    }
  }

  function sendGraffiti(splats: GraffitiSplat[]) {
    if (useAbly) {
      if (currentChannel) {
        currentChannel.publish('graffiti', encodeGraffiti({ splats }))
      }
    } else {
      sendWs(encodeGraffiti({ splats }))
    }
  }

  function sendMotionIfKeysChanged() {
    const mode = options.localMode()
    const protocolMode = modeToProtocol(mode)
    const keys = mode === 'manSitting' || mode === 'womanSitting' ? 0 : encodeKeys(options.localInput)
    const angle = angleToProtocol(keys === 0 ? options.localTurn() : options.localMoveAngle())
    const height = sceneToProtocol(options.localPosition[1])

    if (keys !== lastKeys || protocolMode !== lastMode || height !== lastHeight
      || (keys !== 0 && angle !== lastAngle))
    {
      const motionPacket = {
        x: sceneToProtocol(options.localPosition[0]),
        y: sceneToProtocol(options.localPosition[2]),
        height,
        keys,
        angle,
        idleClipIndex: options.localIdleClipIndex(),
        mode: protocolMode,
        style: options.localStyle(),
        sunglasses: options.localSunglasses(),
      }

      if (useAbly) {
        if (currentChannel) {
          currentChannel.publish('motion', encodeClientMotion(motionPacket))
        }
      } else {
        sendWs(encodeClientMotion(motionPacket))
      }
      lastKeys = keys
      lastAngle = angle
      lastMode = protocolMode
      lastHeight = height
    }
  }

  function close() {
    closed = true
    if (hostSyncInterval) {
      clearInterval(hostSyncInterval)
    }
    if (useAbly) {
      if (currentChannel) {
        try {
          currentChannel.presence.leave()
          currentChannel.unsubscribe()
          currentChannel.presence.unsubscribe()
          currentChannel.detach()
        } catch (e) {
          // ignore close errors
        }
      }
      if (ablyClient) {
        ablyClient.close()
      }
    } else {
      clearInterval(heartbeat)
      clearTimeout(reconnect)
      if (socket) socket.close()
    }
  }

  init()

  return {
    players,
    get selfId() {
      return selfId
    },
    get room() {
      return room
    },
    sendRoomChange,
    sendMessage,
    sendProfile,
    sendEnter,
    sendAdmin,
    sendMotion,
    sendActionsIfChanged,
    sendVideoPlaylist,
    sendBeachBalls,
    sendDuckPosition,
    sendGraffiti,
    sendMotionIfKeysChanged,
    close,
  }
}

export function updateRemotePlayers(players: Iterable<Player>, delta: number, outsideTree: CircleBounds) {
  for (const player of players) {
    const moving = lengthSq(player.input) > 0

    player.motionBlend += ((moving ? 1 : 0) - player.motionBlend) * (1 - Math.exp(-8 * delta))
    if (player.mode === 'jump' || player.mode === 'wave' || player.mode === 'waveOut'
      || player.mode === 'breakdance')
    {
      player.modeTime = (player.modeTime ?? 0) + delta
      const modeTime = player.modeTime

      if (player.mode === 'waveOut' && modeTime >= waveOutDuration) {
        player.mode = player.motionBlend > 0.5 ? 'run' : 'stand'
        player.modeTime = undefined
      }
      if (player.mode === 'breakdance' && modeTime >= breakdanceDuration) {
        player.mode = player.motionBlend > 0.5 ? 'run' : 'stand'
        player.modeTime = undefined
      }
    }
    else if (player.mode !== 'manSitting' && player.mode !== 'womanSitting') {
      player.mode = player.motionBlend > 0.5 ? 'run' : 'stand'
      player.modeTime = undefined
    }

    if (moving) {
      player.position[0] += player.input[0] * delta * 5
      player.position[2] += player.input[2] * delta * 5
      collideRoom(player.position, outsideTree)
    }

    player.position[1] = seatedMode(player.mode)
      ? remoteSeatHeight(player)
      : player.position[1]
  }
}

function createRemotePlayer(packet: SpawnPacket): Player {
  const player: Player = {
    position: [protocolToScene(packet.x), protocolToScene(packet.height), protocolToScene(packet.y)],
    turn: protocolToAngle(packet.angle),
    motionBlend: packet.keys === 0 ? 0 : 1,
    mode: protocolToMode(packet.mode),
    modeTime: timedMode(protocolToMode(packet.mode)) ? 0 : undefined,
    idleClipIndex: packet.idleClipIndex,
    input: decodeKeys(packet.keys, packet.angle),
    nextDecision: 0,
    travelSpeed: 1,
    destination: {
      kind: 'random',
      outside: false,
      position: [0, characterFloor, 0],
      zone: 'inside',
    },
    style: packet.style,
    resolvedStyle: resolvePlayerStyle(packet.style),
    sunglasses: packet.sunglasses,
    seed: packet.id,
  }

  return player
}

function applyRemotePose(player: Player, packet: SpawnPacket) {
  player.position[0] = protocolToScene(packet.x)
  player.position[1] = protocolToScene(packet.height)
  player.position[2] = protocolToScene(packet.y)
  player.turn = protocolToAngle(packet.angle)
  player.input = decodeKeys(packet.keys, packet.angle)
  const mode = protocolToMode(packet.mode)

  player.modeTime = timedMode(mode)
    ? player.mode === mode
      ? player.modeTime ?? 0
      : 0
    : undefined
  player.mode = mode
  if (seatedMode(player.mode)) {
    player.position[1] = remoteSeatHeight(player)
  }
  player.idleClipIndex = packet.idleClipIndex
  player.style = packet.style
  player.resolvedStyle = resolvePlayerStyle(packet.style)
  player.sunglasses = packet.sunglasses
}

function validRemotePose(packet: SpawnPacket) {
  return !seatedMode(protocolToMode(packet.mode))
    || Boolean(
      seatAt([protocolToScene(packet.x), protocolToScene(packet.height), protocolToScene(packet.y)], undefined, 0.46,
        true),
    )
}

function seatedMode(mode: CharacterMode | undefined) {
  return mode === 'manSitting' || mode === 'womanSitting'
}

function timedMode(mode: CharacterMode | undefined) {
  return mode === 'jump' || mode === 'wave' || mode === 'waveOut' || mode === 'breakdance'
}

function remoteSeatHeight(player: Player) {
  return seatAt(player.position, undefined, 0.46, true)!.position[1]
}
