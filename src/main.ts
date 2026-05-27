import './style.css'
import { createCameraController } from './camera-controller.ts'
import { loadCharacterAssets } from './character-assets.ts'
import { jewelPalette } from './character-data.ts'
import { buildCharacterDrawData } from './character-draw.ts'
import {
  drawCharacterBoxes as drawCharacterGpuBoxes,
  drawNpcHair as drawGpuNpcHair,
  uploadCharacterBoxInstances,
} from './character-gpu.ts'
import { createCharacterHairController } from './character-hair-control.ts'
import { updateHairInstances } from './character-hair.ts'
import { createCharacterStyleController } from './character-style.ts'
import { createChatUi } from './chat-ui.ts'
import { createSaveTimer, readClubState, writeClubState } from './club-state.ts'
import { createDjVideoUi } from './dj-video-ui.ts'
import { getDomElements } from './dom-elements.ts'
import { addRoom, addRoomSmoke, addWallStrips } from './environment-object.ts'
import { bindKeyboardInput } from './input.ts'
import { createLocalCharacter } from './local-character.ts'
import { normalizeIndex, setVec3 } from './math.ts'
import { createPlayers, updatePlayers } from './player-system.ts'
import {
  drawRoomDepth as drawRoomDepthPass,
  useLightProgram as useLightDrawProgram,
  useRoomSmokeProgram as useRoomSmokeDrawProgram,
} from './room-draw.ts'
import { createSceneLighting } from './scene-lighting.ts'
import {
  isOutside,
  usesSkyBackground,
} from './scene.ts'
import {
  characterBoxFragment,
  characterBoxVertex,
  fragment,
  hairFragment,
  hairVertex,
  lightFragment,
  postFragment,
  postVertex,
  smokeFragment,
  smokeVertex,
  strobeVertex,
  vertex,
} from './shaders.ts'
import { createStrobeDrawController } from './strobe-draw.ts'
import { createStrobeLights } from './strobe-object.ts'
import { loadOutsideTree } from './tree-world.ts'
import type {
  CharacterRig,
  CircleBounds,
  ClubGlobal,
  HairRenderMesh,
  Vertex,
} from './types.ts'
import {
  setupCharacterBoxArray,
  setupPostArray,
  setupStrobeArray,
  setupVertexArray,
} from './vertex-array-setup.ts'
import {
  createCharacterBoxGeometry,
  createProgram,
  createSmokeMap,
  createStrobeGeometry,
  createTarget,
  createTreeShadowMap,
  resizeTarget,
} from './webgl.ts'

const clubGlobal = globalThis as ClubGlobal

if (clubGlobal.clubFrameId !== undefined) {
  cancelAnimationFrame(clubGlobal.clubFrameId)
}

const { canvas, djVideo, chatForm, chatInput, chatBubble } = getDomElements()

const gl = canvas.getContext('webgl2', {
  antialias: false,
  alpha: false,
})!

if (!gl) {
  throw new Error('WebGL2 is not available')
}

const vertices: Vertex[] = []
const lights: Vertex[] = []
const smoke: Vertex[] = []
const vertexSize = 11
let characterRig: CharacterRig | undefined
let hairRenderMeshes: HairRenderMesh[] = []
let characterRigLoad: Promise<CharacterRig> | undefined
let characterAssetsLoaded = false
let frameId = 0
const saveKey = 'club-state'
const keys = new Set<string>()
const localCharacter = createLocalCharacter(keys)
const characterPosition = localCharacter.position
const hairController = createCharacterHairController()
const styleController = createCharacterStyleController()
const chatUi = createChatUi(chatForm, chatInput, chatBubble, canvas, characterPosition)
const djVideoUi = createDjVideoUi(djVideo, canvas, characterPosition)
const cameraController = createCameraController(canvas, characterPosition)
let outsideTree: CircleBounds = { x: 0, z: 20.5, radius: 0.75 }
let lastStamp = 0
const saveTimer = createSaveTimer(0.5)

addRoom(vertices)
addWallStrips(lights)
addRoomSmoke(smoke)

let points = new Float32Array(vertices.flat())
let lightPoints = new Float32Array(lights.flat())
const smokePoints = new Float32Array(smoke.flat())
const program = createProgram(gl, vertex, fragment)
const lightProgram = createProgram(gl, vertex, lightFragment)
const strobeProgram = createProgram(gl, strobeVertex, lightFragment)
const characterBoxProgram = createProgram(gl, characterBoxVertex, characterBoxFragment)
const hairProgram = createProgram(gl, hairVertex, hairFragment)
const smokeProgram = createProgram(gl, smokeVertex, smokeFragment)
const postProgram = createProgram(gl, postVertex, postFragment)
const smokeMap = createSmokeMap(gl)
const treeShadowMap = createTreeShadowMap(gl)
const resolution = gl.getUniformLocation(program, 'resolution')
const cameraEye = gl.getUniformLocation(program, 'cameraEye')
const cameraCenter = gl.getUniformLocation(program, 'cameraCenter')
const renderZone = gl.getUniformLocation(program, 'renderZone')
const treeShadowSampler = gl.getUniformLocation(program, 'treeShadowMap')
const characterBoxResolution = gl.getUniformLocation(characterBoxProgram, 'resolution')
const characterBoxCameraEye = gl.getUniformLocation(characterBoxProgram, 'cameraEye')
const characterBoxCameraCenter = gl.getUniformLocation(characterBoxProgram, 'cameraCenter')
const characterBoxRenderZone = gl.getUniformLocation(characterBoxProgram, 'renderZone')
const lightTime = gl.getUniformLocation(lightProgram, 'time')
const lightSmokeMap = gl.getUniformLocation(lightProgram, 'smokeMap')
const lightRenderZone = gl.getUniformLocation(lightProgram, 'renderZone')
const lightResolution = gl.getUniformLocation(lightProgram, 'resolution')
const lightCameraEye = gl.getUniformLocation(lightProgram, 'cameraEye')
const lightCameraCenter = gl.getUniformLocation(lightProgram, 'cameraCenter')
const strobeTime = gl.getUniformLocation(strobeProgram, 'time')
const strobeSmokeMap = gl.getUniformLocation(strobeProgram, 'smokeMap')
const strobeRenderZone = gl.getUniformLocation(strobeProgram, 'renderZone')
const strobeResolution = gl.getUniformLocation(strobeProgram, 'resolution')
const strobeCameraEye = gl.getUniformLocation(strobeProgram, 'cameraEye')
const strobeCameraCenter = gl.getUniformLocation(strobeProgram, 'cameraCenter')
const hairResolution = gl.getUniformLocation(hairProgram, 'resolution')
const hairCameraEye = gl.getUniformLocation(hairProgram, 'cameraEye')
const hairCameraCenter = gl.getUniformLocation(hairProgram, 'cameraCenter')
const hairRenderZone = gl.getUniformLocation(hairProgram, 'renderZone')
const roomSmokeTime = gl.getUniformLocation(smokeProgram, 'time')
const roomSmokeMap = gl.getUniformLocation(smokeProgram, 'smokeMap')
const roomSmokeResolution = gl.getUniformLocation(smokeProgram, 'resolution')
const roomSmokeCameraEye = gl.getUniformLocation(smokeProgram, 'cameraEye')
const roomSmokeCameraCenter = gl.getUniformLocation(smokeProgram, 'cameraCenter')
const postScene = gl.getUniformLocation(postProgram, 'scene')
const postBloom = gl.getUniformLocation(postProgram, 'bloom')
const postBloomResolution = gl.getUniformLocation(postProgram, 'bloomResolution')
const array = gl.createVertexArray()
const buffer = gl.createBuffer()
const lightArray = gl.createVertexArray()
const lightBuffer = gl.createBuffer()
const strobeArray = gl.createVertexArray()
const strobeGeometryBuffer = gl.createBuffer()
const strobeInstanceBuffer = gl.createBuffer()
const smokeArray = gl.createVertexArray()
const smokeBuffer = gl.createBuffer()
const characterArray = gl.createVertexArray()
const characterBuffer = gl.createBuffer()
const characterBoxArray = gl.createVertexArray()
const characterBoxGeometryBuffer = gl.createBuffer()
const characterBoxInstanceBuffer = gl.createBuffer()
const postArray = gl.createVertexArray()
const postBuffer = gl.createBuffer()
const target = createTarget(gl, 1, 1)
const bloomTarget = createTarget(gl, 1, 1)
const stride = vertexSize * Float32Array.BYTES_PER_ELEMENT
const strobeGeometry = createStrobeGeometry()
const strobeInstanceSize = 14
const strobeInstanceStride = strobeInstanceSize * Float32Array.BYTES_PER_ELEMENT
const characterBoxGeometry = createCharacterBoxGeometry()
const characterBoxInstanceSize = 17
const characterBoxInstanceStride = characterBoxInstanceSize * Float32Array.BYTES_PER_ELEMENT
let characterBoxInstances: number[] = []
let characterBoxInstanceCount = 0

if (!resolution || !cameraEye || !cameraCenter || !renderZone || !treeShadowSampler || !characterBoxResolution
  || !characterBoxCameraEye || !characterBoxCameraCenter || !characterBoxRenderZone || !lightTime || !lightSmokeMap
  || !lightRenderZone || !lightResolution || !lightCameraEye || !lightCameraCenter || !strobeTime || !strobeSmokeMap
  || !strobeRenderZone || !strobeResolution || !strobeCameraEye || !strobeCameraCenter || !hairResolution
  || !hairCameraEye
  || !hairCameraCenter || !hairRenderZone || !roomSmokeTime || !roomSmokeMap || !roomSmokeResolution
  || !roomSmokeCameraEye || !roomSmokeCameraCenter || !postScene || !postBloom || !postBloomResolution || !array
  || !buffer || !lightArray || !lightBuffer || !strobeArray || !strobeGeometryBuffer || !strobeInstanceBuffer
  || !smokeArray || !smokeBuffer || !characterArray || !characterBuffer
  || !characterBoxArray || !characterBoxGeometryBuffer || !characterBoxInstanceBuffer || !postArray || !postBuffer)
{
  throw new Error('Failed to initialize WebGL resources')
}

const characterBoxUniforms = {
  cameraCenter: characterBoxCameraCenter,
  cameraEye: characterBoxCameraEye,
  renderZone: characterBoxRenderZone,
  resolution: characterBoxResolution,
}
const hairUniforms = {
  cameraCenter: hairCameraCenter,
  cameraEye: hairCameraEye,
  renderZone: hairRenderZone,
  resolution: hairResolution,
}

setupVertexArray({ array, buffer, data: points, gl, stride, usage: gl.STATIC_DRAW })

function refreshRoomBuffer() {
  points = new Float32Array(vertices.flat())
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW)
}

setupVertexArray({ array: lightArray, buffer: lightBuffer, data: lightPoints, gl, stride, usage: gl.DYNAMIC_DRAW })
setupStrobeArray({
  array: strobeArray,
  geometry: strobeGeometry,
  geometryBuffer: strobeGeometryBuffer,
  gl,
  instanceBuffer: strobeInstanceBuffer,
  instanceStride: strobeInstanceStride,
})
setupVertexArray({ array: smokeArray, buffer: smokeBuffer, data: smokePoints, gl, stride, usage: gl.STATIC_DRAW })
setupVertexArray({ array: characterArray, buffer: characterBuffer, data: 0, gl, stride, usage: gl.DYNAMIC_DRAW })
setupCharacterBoxArray({
  array: characterBoxArray,
  geometry: characterBoxGeometry,
  geometryBuffer: characterBoxGeometryBuffer,
  gl,
  instanceBuffer: characterBoxInstanceBuffer,
  instanceStride: characterBoxInstanceStride,
})
setupPostArray({ array: postArray, buffer: postBuffer, gl })

gl.enable(gl.DEPTH_TEST)
gl.clearColor(0.01, 0.01, 0.014, 1.0)

restoreState()
djVideoUi.setZoneFromPosition()
djVideoUi.load()

bindKeyboardInput({
  activeInput: chatInput,
  keys,
  openChatInput,
  cycleHair,
  cycleHairColor,
  cycleShirt,
  cyclePants,
})

chatForm.addEventListener('submit', event => {
  event.preventDefault()
  chatUi.submit()
})

const resize = () => {
  const ratio = window.devicePixelRatio
  const width = Math.floor(canvas.clientWidth * ratio)
  const height = Math.floor(canvas.clientHeight * ratio)

  canvas.width = width
  canvas.height = height
  resizeTarget(gl, target, width, height)
  resizeTarget(gl, bloomTarget, Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)))
  gl.viewport(0, 0, width, height)
}

const draw = (stamp: number) => {
  const delta = lastStamp === 0 ? 0 : Math.min((stamp - lastStamp) / 1000, 0.05)
  const frame = Math.floor(stamp / 16.6667)

  strobeController.setFrame(frame)
  lastStamp = stamp
  resize()
  localCharacter.update(delta, cameraController.turn, outsideTree)
  updatePlayers(players, delta, stamp * 0.001, outsideTree)
  updateCamera(delta)
  updateSave(delta)
  const camera = getCamera()
  const lightCount = updateLightBuffer(stamp * 0.001)

  djVideoUi.update(camera)
  chatUi.update(camera, stamp)

  const outside = isOutside(characterPosition)
  const sky = usesSkyBackground(camera)

  gl.bindFramebuffer(gl.FRAMEBUFFER, target.frame)
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.enable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)
  gl.clearColor(sky ? 0.28 : 0.01, sky ? 0.55 : 0.01, sky ? 0.92 : 0.014, 0.0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.useProgram(program)
  gl.uniform2f(resolution, canvas.width, canvas.height)
  gl.uniform3f(cameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(cameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(renderZone, outside ? 1 : 0)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, treeShadowMap)
  gl.uniform1i(treeShadowSampler, 4)
  gl.bindVertexArray(array)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.enable(gl.POLYGON_OFFSET_FILL)
  gl.polygonOffset(1, 1)
  gl.drawArrays(gl.TRIANGLES, 0, points.length / vertexSize)
  gl.disable(gl.POLYGON_OFFSET_FILL)
  gl.disable(gl.BLEND)
  const characterCount = updateCharacterMesh(stamp * 0.001)

  if (characterCount > 0) {
    gl.bindVertexArray(characterArray)
    gl.drawArrays(gl.TRIANGLES, 0, characterCount)
  }
  drawCharacterBoxes(camera, canvas.width, canvas.height, outside)
  drawNpcHair(camera, canvas.width, canvas.height, outside)

  drawRoomDepthPass({
    array,
    camera,
    count: points.length / vertexSize,
    gl,
    height: canvas.height,
    outside,
    program,
    treeShadowMap,
    uniforms: {
      cameraCenter,
      cameraEye,
      renderZone,
      resolution,
      treeShadowSampler,
    },
    width: canvas.width,
  })
  gl.enable(gl.BLEND)
  gl.depthMask(false)
  if (!outside) {
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    useRoomSmokeDrawProgram({
      camera,
      gl,
      height: canvas.height,
      program: smokeProgram,
      smokeMap,
      time: stamp * 0.001,
      uniforms: {
        cameraCenter: roomSmokeCameraCenter,
        cameraEye: roomSmokeCameraEye,
        resolution: roomSmokeResolution,
        smokeMap: roomSmokeMap,
        time: roomSmokeTime,
      },
      width: canvas.width,
    })
    gl.bindVertexArray(smokeArray)
    gl.drawArrays(gl.TRIANGLES, 0, smokePoints.length / vertexSize)
  }
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
  useLightDrawProgram({
    camera,
    characterPosition,
    frame,
    gl,
    height: canvas.height,
    program: lightProgram,
    smokeMap,
    uniforms: {
      cameraCenter: lightCameraCenter,
      cameraEye: lightCameraEye,
      renderZone: lightRenderZone,
      resolution: lightResolution,
      smokeMap: lightSmokeMap,
      time: lightTime,
    },
    width: canvas.width,
  })
  gl.bindVertexArray(lightArray)
  gl.drawArrays(gl.TRIANGLES, 0, lightCount)
  drawStrobes(camera, canvas.width, canvas.height, frame)
  gl.depthMask(true)
  gl.disable(gl.BLEND)

  gl.bindFramebuffer(gl.FRAMEBUFFER, bloomTarget.frame)
  gl.viewport(0, 0, bloomTarget.width, bloomTarget.height)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.useProgram(program)
  gl.uniform2f(resolution, bloomTarget.width, bloomTarget.height)
  gl.uniform3f(cameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(cameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(renderZone, outside ? 1 : 0)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, treeShadowMap)
  gl.uniform1i(treeShadowSampler, 4)
  gl.colorMask(false, false, false, false)
  gl.bindVertexArray(array)
  gl.enable(gl.POLYGON_OFFSET_FILL)
  gl.polygonOffset(1, 1)
  gl.drawArrays(gl.TRIANGLES, 0, points.length / vertexSize)
  gl.disable(gl.POLYGON_OFFSET_FILL)

  if (characterCount > 0) {
    gl.bindVertexArray(characterArray)
    gl.drawArrays(gl.TRIANGLES, 0, characterCount)
  }
  drawCharacterBoxes(camera, bloomTarget.width, bloomTarget.height, outside)
  drawNpcHair(camera, bloomTarget.width, bloomTarget.height, outside)

  drawRoomDepthPass({
    array,
    camera,
    count: points.length / vertexSize,
    gl,
    height: bloomTarget.height,
    outside,
    program,
    treeShadowMap,
    uniforms: {
      cameraCenter,
      cameraEye,
      renderZone,
      resolution,
      treeShadowSampler,
    },
    width: bloomTarget.width,
  })
  gl.colorMask(true, true, true, true)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
  gl.depthMask(false)
  useLightDrawProgram({
    camera,
    characterPosition,
    frame,
    gl,
    height: bloomTarget.height,
    program: lightProgram,
    smokeMap,
    uniforms: {
      cameraCenter: lightCameraCenter,
      cameraEye: lightCameraEye,
      renderZone: lightRenderZone,
      resolution: lightResolution,
      smokeMap: lightSmokeMap,
      time: lightTime,
    },
    width: bloomTarget.width,
  })
  gl.bindVertexArray(lightArray)
  gl.drawArrays(gl.TRIANGLES, 0, lightCount)
  drawStrobes(camera, bloomTarget.width, bloomTarget.height, frame)
  gl.depthMask(true)
  gl.disable(gl.BLEND)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)
  gl.clearColor(sky ? 0.28 : 0.01, sky ? 0.55 : 0.01, sky ? 0.92 : 0.014, 1.0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(postProgram)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, target.color)
  gl.uniform1i(postScene, 0)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, bloomTarget.color)
  gl.uniform1i(postBloom, 1)
  gl.uniform2f(postBloomResolution, bloomTarget.width, bloomTarget.height)
  gl.bindVertexArray(postArray)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  frameId = requestAnimationFrame(draw)
  clubGlobal.clubFrameId = frameId
}

frameId = requestAnimationFrame(draw)
clubGlobal.clubFrameId = frameId

loadCharacterRigOnce()
  .then(next => {
    characterRig = next
  })
  .catch((error: unknown) => {
    console.error(error)
  })

function loadCharacterRigOnce() {
  characterRigLoad ??= loadCharacterRig()

  return characterRigLoad
}

import.meta.hot?.dispose(() => {
  cancelAnimationFrame(frameId)
})

function updateLightBuffer(time: number) {
  strobeController.updateInstances(time, djVideoUi.zone)

  return lightPoints.length / vertexSize
}

function drawStrobes(camera: ReturnType<typeof getCamera>, width: number, height: number, frame: number) {
  strobeController.draw(camera, width, height, frame)
}

const strobeLights = createStrobeLights()
const strobeController = createStrobeDrawController({
  array: strobeArray,
  characterPosition,
  geometry: strobeGeometry,
  gl,
  instanceBuffer: strobeInstanceBuffer,
  instanceSize: strobeInstanceSize,
  lights: strobeLights,
  program: strobeProgram,
  smokeMap,
  uniforms: {
    cameraCenter: strobeCameraCenter,
    cameraEye: strobeCameraEye,
    renderZone: strobeRenderZone,
    resolution: strobeResolution,
    smokeMap: strobeSmokeMap,
    time: strobeTime,
  },
})
const { addLocalReflection, addSunLitTriangle } = createSceneLighting({
  getTree: () => outsideTree,
  strobeReflection: (point, normal) => strobeController.reflection(point, normal),
})
const players = createPlayers(100, outsideTree)
async function loadCharacterRig(): Promise<CharacterRig> {
  const assets = await loadCharacterAssets(gl, hairController.index)

  hairRenderMeshes = assets.hairRenderMeshes
  hairController.setMeshes(assets.hairMeshes, assets.hairIndex)
  characterAssetsLoaded = true
  hairController.log()
  loadOutsideTree(gl, treeShadowMap, vertices, outsideTree, addSunLitTriangle)
    .then(nextTree => {
      outsideTree = nextTree
      refreshRoomBuffer()
    })
    .catch((error: unknown) => {
      console.error(error)
    })

  return assets.rig
}

function updateCharacterMesh(time: number) {
  if (!characterRig) {
    return 0
  }

  const data = buildCharacterDrawData({
    cameraPosition: cameraController.position,
    cameraTarget: cameraController.target,
    character: {
      position: characterPosition,
      turn: localCharacter.turn,
      motionBlend: localCharacter.motionBlend,
      style: {
        topStyleIndex: styleController.topStyleIndex,
        bottomStyleIndex: styleController.bottomStyleIndex,
        hairIndex: hairController.index,
        hairColorIndex: hairController.colorIndex,
      },
    },
    hairMeshes: hairController.meshes,
    height: canvas.height,
    light: addLocalReflection,
    players,
    rig: characterRig,
    time,
    width: canvas.width,
  })

  characterBoxInstances = data.boxInstances
  updateHairInstances(gl, hairRenderMeshes, data.hairInstances)
  updateCharacterBoxInstances()

  gl.bindBuffer(gl.ARRAY_BUFFER, characterBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.DYNAMIC_DRAW)

  return data.vertices.length / vertexSize
}

function updateCharacterBoxInstances() {
  characterBoxInstanceCount = uploadCharacterBoxInstances({
    buffer: characterBoxInstanceBuffer,
    gl,
    instances: characterBoxInstances,
    instanceSize: characterBoxInstanceSize,
  })
}

function drawCharacterBoxes(camera: ReturnType<typeof getCamera>, width: number, height: number, outside: boolean) {
  drawCharacterGpuBoxes({
    array: characterBoxArray,
    camera,
    count: characterBoxInstanceCount,
    geometry: characterBoxGeometry,
    gl,
    height,
    outside,
    program: characterBoxProgram,
    uniforms: characterBoxUniforms,
    width,
  })
}

function drawNpcHair(camera: ReturnType<typeof getCamera>, width: number, height: number, outside: boolean) {
  drawGpuNpcHair({
    camera,
    gl,
    hairRenderMeshes,
    height,
    outside,
    program: hairProgram,
    uniforms: hairUniforms,
    width,
  })
}

function restoreState() {
  const state = readClubState(saveKey)

  if (state) {
    setVec3(characterPosition, state.character)
    setVec3(cameraController.position, state.camera)
    cameraController.turn = state.cameraTurn
    localCharacter.turn = state.characterTurn
    localCharacter.velocityY = state.velocityY
    hairController.index = state.characterHairIndex ?? hairController.index
    hairController.colorIndex = state.characterHairColorIndex ?? hairController.colorIndex
    styleController.topStyleIndex = normalizeIndex(state.topStyleIndex ?? state.shirtColorIndex
      ?? styleController.topStyleIndex, jewelPalette.length * 2 + 2)
    styleController.bottomStyleIndex = normalizeIndex(state.bottomStyleIndex ?? state.pantsColorIndex
      ?? styleController.bottomStyleIndex, jewelPalette.length * 2)
    djVideoUi.times.inside = state.videoTimes?.inside ?? djVideoUi.times.inside
    djVideoUi.times.outside = state.videoTimes?.outside ?? djVideoUi.times.outside
    styleController.setTopStyle()
    styleController.setBottomStyle()
  }
}

function saveState() {
  if (!characterAssetsLoaded) {
    return
  }

  djVideoUi.syncCurrentTime()

  writeClubState(saveKey, {
    character: characterPosition,
    camera: cameraController.position,
    cameraTurn: cameraController.turn,
    characterTurn: localCharacter.turn,
    velocityY: localCharacter.velocityY,
    characterHairIndex: hairController.index,
    characterHairColorIndex: hairController.colorIndex,
    shirtColorIndex: styleController.shirtColorIndex,
    topStyleIndex: styleController.topStyleIndex,
    pantsColorIndex: styleController.pantsColorIndex,
    bottomStyleIndex: styleController.bottomStyleIndex,
    videoTimes: djVideoUi.times,
  })
}

function updateSave(delta: number) {
  saveTimer.update(delta, saveState)
}

function updateCamera(delta: number) {
  localCharacter.readInput()
  cameraController.update(delta, localCharacter.input, localCharacter.turn)
}

function getCamera() {
  return cameraController.get()
}

function openChatInput() {
  chatUi.open()
}

function cycleHair(direction: number) {
  hairController.cycleHair(direction)
}

function cycleHairColor(direction: number) {
  hairController.cycleColor(direction)
}

function cycleShirt(direction: number) {
  styleController.cycleShirt(direction)
}

function cyclePants(direction: number) {
  styleController.cyclePants(direction)
}
