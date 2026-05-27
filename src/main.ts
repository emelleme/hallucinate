import './style.css'
import assimpjs from 'assimpjs'
import {
  characterBones,
  characterFloor,
  characterGroundJoints,
  characterScale,
  hairPalette,
  jewelPalette,
  shoe,
  skin,
} from './character-data.ts'
import { createCameraController } from './camera-controller.ts'
import { createHairMeshes, createHairRenderMeshes, updateHairInstances } from './character-hair.ts'
import {
  createCharacterClip,
  createRigNodes,
  sampleBasePose,
  sampleCharacterPose,
  validateCharacterRig,
} from './character-rig.ts'
import { characterParts, characterPoseJoints, characterPoseJointSet } from './character-parts.ts'
import { applyBottomStyle, applyTopStyle, resolvePlayerStyle } from './character-style.ts'
import { createChatUi } from './chat-ui.ts'
import { readClubState, writeClubState } from './club-state.ts'
import { electricNavy, outsideMotif } from './constants.ts'
import { createDjVideoUi } from './dj-video-ui.ts'
import { addRoom, addRoomSmoke, addWallStrips } from './environment-object.ts'
import { addQuad } from './geometry.ts'
import { bindKeyboardInput, readMoveInput } from './input.ts'
import {
  add,
  clamp,
  cross,
  dot,
  lengthSq,
  mix,
  normalize,
  normalizeIndex,
  normalizeInto,
  scale,
  setVec3,
  smoothAngle,
  smoothstep,
  subtract,
} from './math.ts'
import {
  collideRoom,
  isOutside,
  usesSkyBackground,
  walkHeight,
} from './scene.ts'
import { createPlayers, updatePlayers } from './player-system.ts'
import {
  backDoor,
  bartenderBar,
  bartenderStools,
  djBooth,
  djSpeakers,
  landscapeBounds,
  outsideBounds,
  outsideDjBooth,
  outsideDjSpeakers,
  roomBounds,
} from './scene-data.ts'
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
import { createStrobeLights, strobeLightAmount, strobeRandom, strobeTarget } from './strobe-object.ts'
import { addTreeShadowReceiver, createTreeMeshes, treeCollision, uploadTreeShadowMap } from './tree-object.ts'
import type {
  AssimpScene,
  BottomMode,
  CharacterMode,
  CharacterPart,
  CharacterRig,
  CircleBounds,
  ClubGlobal,
  HairInstance,
  HairMesh,
  HairRenderMesh,
  Player,
  PlayerStyle,
  PoseBlendCache,
  ResolvedPlayerStyle,
  SampledPose,
  StrobeReflectionLight,
  TopMode,
  TreeMesh,
  Vec3,
  Vertex,
} from './types.ts'
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

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const djVideo = document.querySelector<HTMLElement>('#dj-video')!
const chatForm = document.querySelector<HTMLFormElement>('#chat-form')!
const chatInput = document.querySelector<HTMLInputElement>('#chat-input')!
const chatBubble = document.querySelector<HTMLDivElement>('#chat-bubble')!

if (!canvas) {
  throw new Error('Missing scene canvas')
}

if (!djVideo) {
  throw new Error('Missing DJ video element')
}

if (!chatForm || !chatInput || !chatBubble) {
  throw new Error('Missing chat elements')
}

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
let characterHair: HairMesh | undefined
let characterHairIndex = 0
let characterHairColorIndex = 0
let characterHairMeshes: HairMesh[] = []
let hairRenderMeshes: HairRenderMesh[] = []
let hairInstances: HairInstance[] = []
let characterMode: CharacterMode = 'stand'
let characterRigLoad: Promise<CharacterRig> | undefined
let frameId = 0
const saveKey = 'club-state'
const keys = new Set<string>()
const input: Vec3 = [0, 0, 0]
const forward: Vec3 = [0, 0, 0]
const right: Vec3 = [0, 0, 0]
const direction: Vec3 = [0, 0, 0]
const characterPosition: Vec3 = [-2.2, -1.95, -6.8]
const chatUi = createChatUi(chatForm, chatInput, chatBubble, canvas, characterPosition)
const djVideoUi = createDjVideoUi(djVideo, canvas, characterPosition)
const camera = createCameraController(canvas, characterPosition)
let outsideTree: CircleBounds = { x: 0, z: 20.5, radius: 0.75 }
let characterTurn = 0
let characterMotionBlend = 0
let floorY = -1.95
let velocityY = 0
let lastStamp = 0
let saveTime = 0

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
let strobeInstances: number[] = []
let strobeInstanceCount = 0

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

gl.bindVertexArray(array)
gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT)
gl.bindVertexArray(null)

function refreshRoomBuffer() {
  points = new Float32Array(vertices.flat())
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW)
}

gl.bindVertexArray(lightArray)
gl.bindBuffer(gl.ARRAY_BUFFER, lightBuffer)
gl.bufferData(gl.ARRAY_BUFFER, lightPoints, gl.DYNAMIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT)
gl.bindVertexArray(null)

gl.bindVertexArray(strobeArray)
gl.bindBuffer(gl.ARRAY_BUFFER, strobeGeometryBuffer)
gl.bufferData(gl.ARRAY_BUFFER, strobeGeometry.data, gl.STATIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 4 * Float32Array.BYTES_PER_ELEMENT)
gl.bindBuffer(gl.ARRAY_BUFFER, strobeInstanceBuffer)
gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 3, gl.FLOAT, false, strobeInstanceStride, 0)
gl.vertexAttribDivisor(2, 1)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 3, gl.FLOAT, false, strobeInstanceStride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.vertexAttribDivisor(3, 1)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 3, gl.FLOAT, false, strobeInstanceStride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.vertexAttribDivisor(4, 1)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 3, gl.FLOAT, false, strobeInstanceStride, 9 * Float32Array.BYTES_PER_ELEMENT)
gl.vertexAttribDivisor(5, 1)
gl.enableVertexAttribArray(6)
gl.vertexAttribPointer(6, 2, gl.FLOAT, false, strobeInstanceStride, 12 * Float32Array.BYTES_PER_ELEMENT)
gl.vertexAttribDivisor(6, 1)
gl.bindVertexArray(null)

gl.bindVertexArray(smokeArray)
gl.bindBuffer(gl.ARRAY_BUFFER, smokeBuffer)
gl.bufferData(gl.ARRAY_BUFFER, smokePoints, gl.STATIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT)
gl.bindVertexArray(null)

gl.bindVertexArray(characterArray)
gl.bindBuffer(gl.ARRAY_BUFFER, characterBuffer)
gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT)
gl.bindVertexArray(null)

gl.bindVertexArray(characterBoxArray)
gl.bindBuffer(gl.ARRAY_BUFFER, characterBoxGeometryBuffer)
gl.bufferData(gl.ARRAY_BUFFER, characterBoxGeometry.data, gl.STATIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.bindBuffer(gl.ARRAY_BUFFER, characterBoxInstanceBuffer)
gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW)
for (let i = 0; i < 5; i++) {
  const location = 2 + i

  gl.enableVertexAttribArray(location)
  gl.vertexAttribPointer(location, 3, gl.FLOAT, false, characterBoxInstanceStride,
    i * 3 * Float32Array.BYTES_PER_ELEMENT)
  gl.vertexAttribDivisor(location, 1)
}
gl.enableVertexAttribArray(7)
gl.vertexAttribPointer(7, 1, gl.FLOAT, false, characterBoxInstanceStride, 15 * Float32Array.BYTES_PER_ELEMENT)
gl.vertexAttribDivisor(7, 1)
gl.enableVertexAttribArray(8)
gl.vertexAttribPointer(8, 1, gl.FLOAT, false, characterBoxInstanceStride, 16 * Float32Array.BYTES_PER_ELEMENT)
gl.vertexAttribDivisor(8, 1)
gl.bindVertexArray(null)

gl.bindVertexArray(postArray)
gl.bindBuffer(gl.ARRAY_BUFFER, postBuffer)
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
gl.bindVertexArray(null)

gl.enable(gl.DEPTH_TEST)
gl.clearColor(0.01, 0.01, 0.014, 1.0)
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

  lightFrame = frame
  lastStamp = stamp
  resize()
  updateCharacter(delta)
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

  drawRoomDepth(camera, canvas.width, canvas.height, outside)
  gl.enable(gl.BLEND)
  gl.depthMask(false)
  if (!outside) {
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    useRoomSmokeProgram(camera, canvas.width, canvas.height, stamp * 0.001)
    gl.bindVertexArray(smokeArray)
    gl.drawArrays(gl.TRIANGLES, 0, smokePoints.length / vertexSize)
  }
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
  useLightProgram(camera, canvas.width, canvas.height, frame)
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

  drawRoomDepth(camera, bloomTarget.width, bloomTarget.height, outside)
  gl.colorMask(true, true, true, true)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
  gl.depthMask(false)
  useLightProgram(camera, bloomTarget.width, bloomTarget.height, frame)
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
  characterRigLoad ??= clubGlobal.clubCharacterRigLoad ??= loadCharacterRig()

  return characterRigLoad
}

import.meta.hot?.dispose(() => {
  cancelAnimationFrame(frameId)
})

function drawRoomDepth(
  camera: { eye: [number, number, number]; center: [number, number, number] },
  width: number,
  height: number,
  outside: boolean,
) {
  gl.useProgram(program)
  gl.uniform2f(resolution, width, height)
  gl.uniform3f(cameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(cameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(renderZone, outside ? 1 : 0)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, treeShadowMap)
  gl.uniform1i(treeShadowSampler, 4)
  gl.colorMask(false, false, false, false)
  gl.depthMask(true)
  gl.bindVertexArray(array)
  gl.drawArrays(gl.TRIANGLES, 0, points.length / vertexSize)
  gl.colorMask(true, true, true, true)
}

function useRoomSmokeProgram(
  camera: { eye: [number, number, number]; center: [number, number, number] },
  width: number,
  height: number,
  time: number,
) {
  gl.useProgram(smokeProgram)
  gl.uniform1f(roomSmokeTime, time)
  gl.uniform2f(roomSmokeResolution, width, height)
  gl.uniform3f(roomSmokeCameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(roomSmokeCameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.activeTexture(gl.TEXTURE3)
  gl.bindTexture(gl.TEXTURE_2D, smokeMap)
  gl.uniform1i(roomSmokeMap, 3)
}

function useLightProgram(
  camera: { eye: [number, number, number]; center: [number, number, number] },
  width: number,
  height: number,
  frame: number,
) {
  gl.useProgram(lightProgram)
  gl.uniform1f(lightTime, frame)
  gl.uniform1i(lightRenderZone, isOutside(characterPosition) ? 1 : 0)
  gl.uniform2f(lightResolution, width, height)
  gl.uniform3f(lightCameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(lightCameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, smokeMap)
  gl.uniform1i(lightSmokeMap, 2)
}

function useStrobeProgram(
  camera: { eye: [number, number, number]; center: [number, number, number] },
  width: number,
  height: number,
  frame: number,
) {
  gl.useProgram(strobeProgram)
  gl.uniform1f(strobeTime, frame)
  gl.uniform1i(strobeRenderZone, isOutside(characterPosition) ? 1 : 0)
  gl.uniform2f(strobeResolution, width, height)
  gl.uniform3f(strobeCameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(strobeCameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, smokeMap)
  gl.uniform1i(strobeSmokeMap, 2)
}

function updateLightBuffer(time: number) {
  updateStrobeInstances(time)

  return lightPoints.length / vertexSize
}

function updateStrobeInstances(time: number) {
  strobeInstances.length = 0

  for (const light of strobeLights) {
    if (light.zone !== djVideoUi.zone) {
      continue
    }

    const hit = strobeTarget(light, time)
    const outside = light.zone === 'outside'

    strobeInstances.push(
      light.x,
      light.top,
      light.z,
      hit[0],
      light.floor,
      hit[2],
      0.07,
      outside ? 1.35 : 0.5,
      outside ? 1.85 : 0.68,
      light.color[0],
      light.color[1],
      light.color[2],
      light.id,
      outside ? 0.7 : 0.42,
    )
  }

  strobeInstanceCount = strobeInstances.length / strobeInstanceSize
  gl.bindBuffer(gl.ARRAY_BUFFER, strobeInstanceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(strobeInstances), gl.DYNAMIC_DRAW)
}

function drawStrobes(camera: ReturnType<typeof getCamera>, width: number, height: number, frame: number) {
  if (strobeInstanceCount === 0) {
    return
  }

  useStrobeProgram(camera, width, height, frame)
  gl.bindVertexArray(strobeArray)
  gl.drawArraysInstanced(gl.TRIANGLES, 0, strobeGeometry.count, strobeInstanceCount)
}

let shirtColorIndex = 1
let topStyleIndex = 1
let topMode: TopMode = 'shirt'
let pantsColorIndex = 0
let bottomStyleIndex = 0
let bottomMode: BottomMode = 'pants'
restoreState()
djVideoUi.setZoneFromPosition()
djVideoUi.load()
const wallLightZ = [-2, -6, -10, -14, -18, -22]
const backLightX = [-4.5, 0, 4.5]
const strobeLights = createStrobeLights()
const players = createPlayers(100, outsideTree)
let lightFrame = 0
let strobeReflectionFrame = -1
let strobeReflectionLights: StrobeReflectionLight[] = []
async function loadCharacterRig(): Promise<CharacterRig> {
  const ajs = await assimpjs({
    locateFile(path) {
      return path.endsWith('.wasm') ? '/assimpjs.wasm' : path
    },
  })
  const [stand, run, manHair, womanHair] = await Promise.all([
    loadAssimpScene(ajs, '/stand.fbx', 'stand.fbx'),
    loadAssimpScene(ajs, '/run.fbx', 'run.fbx'),
    loadAssimpScene(ajs, '/man-hair.fbx', 'man-hair.fbx'),
    loadAssimpScene(ajs, '/woman-hair.fbx', 'woman-hair.fbx'),
  ])
  const rig = {
    root: stand.rootnode,
    nodes: createRigNodes(stand.rootnode),
    clips: {
      stand: createCharacterClip(stand, 'stand.fbx'),
      run: createCharacterClip(run, 'run.fbx'),
    },
  }

  validateCharacterRig(rig.root, characterBones)
  characterHairMeshes = [...createHairMeshes(manHair, 'man'), ...createHairMeshes(womanHair, 'woman')]
  hairRenderMeshes = createHairRenderMeshes(gl, characterHairMeshes)
  characterHairIndex = normalizeIndex(characterHairIndex, characterHairMeshes.length + 1)
  setCharacterHair()
  logCurrentHair()
  loadOutsideTree().catch((error: unknown) => {
    console.error(error)
  })

  return rig
}

async function loadOutsideTree() {
  const ajs = await assimpjs({
    locateFile(path) {
      return path.endsWith('.wasm') ? '/assimpjs.wasm' : path
    },
  })
  const trees = await loadAssimpScene(ajs, '/trees.fbx', 'trees.fbx')

  addTreeToWorld(createTreeMeshes(trees))
}

function addTreeToWorld(meshes: TreeMesh[]) {
  const position: Vec3 = [outsideTree.x, characterFloor + 3.7, outsideTree.z]

  outsideTree = treeCollision(meshes, position)

  if (outsideMotif !== 'night') {
    uploadTreeShadowMap(gl, treeShadowMap, meshes, position, characterFloor, landscapeBounds, roomBounds.front)
    addTreeShadowReceiver(vertices, characterFloor, landscapeBounds)
  }

  for (const mesh of meshes) {
    for (const face of mesh.faces) {
      const a = add(position, mesh.points[face[0]!]!)
      const b = add(position, mesh.points[face[1]!]!)
      const c = add(position, mesh.points[face[2]!]!)

      if (triangleAreaSquared(a, b, c) > 0.00000001) {
        addSunLitTriangle(vertices, a, b, c, mesh.color)
      }
    }
  }

  refreshRoomBuffer()
}

async function loadAssimpScene(
  ajs: Awaited<ReturnType<typeof assimpjs>>,
  path: string,
  name: string,
): Promise<AssimpScene> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`)
  }

  const files = new ajs.FileList()

  files.AddFile(name, new Uint8Array(await response.arrayBuffer()))

  const result = ajs.ConvertFileList(files, 'assjson')

  if (!result.IsSuccess() || result.FileCount() === 0) {
    throw new Error(`Assimp failed to convert ${name}: ${result.GetErrorCode()}`)
  }

  return JSON.parse(new TextDecoder().decode(result.GetFile(0).GetContent())) as AssimpScene
}

function updateCharacterMesh(time: number) {
  if (!characterRig) {
    return 0
  }

  const target: Vertex[] = []
  characterBoxInstances = []
  hairInstances = []
  addRenderedCharacter(target, {
    position: characterPosition,
    turn: characterTurn,
    motionBlend: characterMotionBlend,
    style: {
      topStyleIndex,
      bottomStyleIndex,
      hairIndex: characterHairIndex,
      hairColorIndex: characterHairColorIndex,
    },
  }, time, true)

  const view = playerView()
  const npcPose = sampleBasePose(characterRig, time, characterPoseJointSet)
  const npcBlendCache: PoseBlendCache = new Map()

  for (const player of players) {
    if (playerInView(player, view)) {
      addRenderedCharacter(target, player, time, false, npcPose, npcBlendCache)
    }
  }

  updateHairInstances(gl, hairRenderMeshes, hairInstances)
  updateCharacterBoxInstances()
  const data = flattenVertices(target)

  gl.bindBuffer(gl.ARRAY_BUFFER, characterBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)

  return data.length / vertexSize
}

function updateCharacterBoxInstances() {
  characterBoxInstanceCount = characterBoxInstances.length / characterBoxInstanceSize
  gl.bindBuffer(gl.ARRAY_BUFFER, characterBoxInstanceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(characterBoxInstances), gl.DYNAMIC_DRAW)
}

function drawCharacterBoxes(camera: ReturnType<typeof getCamera>, width: number, height: number, outside: boolean) {
  if (characterBoxInstanceCount === 0) {
    return
  }

  gl.useProgram(characterBoxProgram)
  gl.uniform2f(characterBoxResolution, width, height)
  gl.uniform3f(characterBoxCameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(characterBoxCameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(characterBoxRenderZone, outside ? 1 : 0)
  gl.bindVertexArray(characterBoxArray)
  gl.drawArraysInstanced(gl.TRIANGLES, 0, characterBoxGeometry.count, characterBoxInstanceCount)
  gl.bindVertexArray(null)
}

function flattenVertices(target: Vertex[]) {
  const data = new Float32Array(target.length * vertexSize)
  let offset = 0

  for (const vertex of target) {
    data[offset++] = vertex[0]
    data[offset++] = vertex[1]
    data[offset++] = vertex[2]
    data[offset++] = vertex[3]
    data[offset++] = vertex[4]
    data[offset++] = vertex[5]
    data[offset++] = vertex[6]
    data[offset++] = vertex[7]
    data[offset++] = vertex[8]
    data[offset++] = vertex[9]
    data[offset++] = vertex[10]
  }

  return data
}

function drawNpcHair(camera: ReturnType<typeof getCamera>, width: number, height: number, outside: boolean) {
  gl.useProgram(hairProgram)
  gl.uniform2f(hairResolution, width, height)
  gl.uniform3f(hairCameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(hairCameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(hairRenderZone, outside ? 1 : 0)

  for (const mesh of hairRenderMeshes) {
    if (mesh.instanceCount > 0) {
      gl.bindVertexArray(mesh.array)
      gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.vertexCount, mesh.instanceCount)
    }
  }

  gl.bindVertexArray(null)
}

function playerView() {
  const eye = camera.position
  const forward = normalize(subtract(camera.target, eye))
  const right = normalize(cross(forward, [0, 1, 0]))
  const up = cross(right, forward)

  return { eye, forward, right, up }
}

function playerInView(player: Player, view: ReturnType<typeof playerView>) {
  const center: Vec3 = [player.position[0], player.position[1] + 0.85, player.position[2]]
  const toPlayer = subtract(center, view.eye)
  const depth = dot(toPlayer, view.forward)
  const radius = 1.2

  if (depth < -radius || depth > 45) {
    return false
  }

  const vertical = Math.tan(1.08 / 2) * Math.max(depth, 0.1) + radius
  const horizontal = vertical * (canvas.width / canvas.height) + radius

  return Math.abs(dot(toPlayer, view.right)) < horizontal && Math.abs(dot(toPlayer, view.up)) < vertical
}

function addRenderedCharacter(
  target: Vertex[],
  player: {
    position: Vec3
    turn: number
    motionBlend: number
    style: PlayerStyle
    resolvedStyle?: ResolvedPlayerStyle
  },
  time: number,
  detailedHair: boolean,
  basePose?: SampledPose,
  blendCache?: PoseBlendCache,
) {
  const pose = sampleCharacterPose(characterRig!, time, player, characterPoseJoints, characterPoseJointSet,
    characterGroundJoints, characterScale, basePose, blendCache)
  const style = player.resolvedStyle ?? resolvePlayerStyle(player.style)
  const localReflection = detailedHair

  for (const part of characterParts) {
    if (style.bottomMode === 'pants' || !part.bottom) {
      addCharacterPart(target, pose, part, player, style, localReflection)
    }
  }

  if (style.bottomMode === 'skirt') {
    addCharacterSkirt(target, pose, player, style, localReflection)
  }

  if (style.topMode === 'chest') {
    addCharacterChest(target, pose, player, localReflection)
  }

  const hair = playerHair(player.style.hairIndex)

  if (hair && detailedHair) {
    addCharacterHair(target, pose, hair, player, style.hairColor)
  }
  else if (hair && characterHairMeshes.length > 0) {
    addNpcHairInstance(pose, hair, player, style.hairColor)
  }
}

function addNpcHairInstance(pose: Map<string, Vec3>, hair: HairMesh, player: { turn: number }, color: Vec3) {
  const head = pose.get('mixamorig:Head')!
  const top = pose.get('mixamorig:HeadTop_End')!
  const up = normalize(subtract(top, head))
  const center = add(head, scale(up, -0.035))
  hairInstances.push({
    meshIndex: characterHairMeshes.indexOf(hair),
    center,
    side: [Math.cos(player.turn), 0, -Math.sin(player.turn)],
    up,
    forward: [Math.sin(player.turn), 0, Math.cos(player.turn)],
    color,
  })
}

function addCharacterPart(
  target: Vertex[],
  pose: Map<string, Vec3>,
  part: CharacterPart,
  player: { turn: number },
  style: ResolvedPlayerStyle,
  localReflection: boolean,
) {
  const from = pose.get(part.from)!
  const to = pose.get(part.to)!
  const start = part.start ?? 0
  const end = part.end ?? 1
  const axis = subtract(to, from)
  let a = add(from, scale(axis, start))
  let b = add(from, scale(axis, end))

  if (part.armOffset) {
    const center = scale(add(a, b), 0.5)
    const torso = pose.get('mixamorig:Spine2')!
    const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
    const amount = Math.sign(dot(subtract(center, torso), side)) * part.armOffset
    const offset = scale(side, amount)

    a = add(a, offset)
    b = add(b, offset)
  }

  if (part.lift) {
    const offset: Vec3 = [0, part.lift, 0]

    a = add(a, offset)
    b = add(b, offset)
  }

  addCharacterBox(target, a, b, part.width, part.depth, characterPartColor(part, style), part.glow ?? 0.02, player.turn,
    localReflection)
}

function characterPartColor(part: CharacterPart, style: ResolvedPlayerStyle) {
  if (part.top === 'torso') {
    return style.topMode === 'shirt' || style.topMode === 'sleeveless' ? style.shirtLight : skin
  }

  if (part.top === 'sleeve') {
    return style.topMode === 'shirt' ? style.shirt : skin
  }

  if (part.bottom) {
    return style.pants
  }

  if (part.color === shoe) {
    return style.shoe
  }

  return part.color
}

function addCharacterChest(
  target: Vertex[],
  pose: Map<string, Vec3>,
  player: { turn: number },
  localReflection: boolean,
) {
  const spine = pose.get('mixamorig:Spine2')!
  const neck = pose.get('mixamorig:Neck')!
  const center = add(spine, scale(subtract(neck, spine), 0.32))
  const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
  const forward: Vec3 = [Math.sin(player.turn), 0, Math.cos(player.turn)]

  for (const offset of [-0.055, 0.055]) {
    const a = add(add(center, scale(side, offset)), scale(forward, 0.06))
    const b = add(add(center, scale(side, offset)), scale(forward, 0.13))

    addCharacterBox(target, a, b, 0.065, 0.06, skin, 0.02, player.turn, localReflection)
  }
}

function addCharacterSkirt(
  target: Vertex[],
  pose: Map<string, Vec3>,
  player: { turn: number },
  style: ResolvedPlayerStyle,
  localReflection: boolean,
) {
  const hips = pose.get('mixamorig:Hips')!
  const leftUp = pose.get('mixamorig:LeftUpLeg')!
  const rightUp = pose.get('mixamorig:RightUpLeg')!
  const leftLeg = pose.get('mixamorig:LeftLeg')!
  const rightLeg = pose.get('mixamorig:RightLeg')!
  const topCenter = scale(add(add(hips, leftUp), rightUp), 1 / 3)
  const bottomCenter = scale(add(leftLeg, rightLeg), 0.5)
  const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
  const forward: Vec3 = [Math.sin(player.turn), 0, Math.cos(player.turn)]
  const topWidth = 0.09
  const bottomWidth = 0.15
  const topDepth = 0.11
  const bottomDepth = 0.14
  const a = add(add(topCenter, scale(side, -topWidth)), scale(forward, -topDepth))
  const b = add(add(topCenter, scale(side, topWidth)), scale(forward, -topDepth))
  const c = add(add(topCenter, scale(side, topWidth)), scale(forward, topDepth))
  const d = add(add(topCenter, scale(side, -topWidth)), scale(forward, topDepth))
  const e = add(add(bottomCenter, scale(side, -bottomWidth)), scale(forward, -bottomDepth))
  const f = add(add(bottomCenter, scale(side, bottomWidth)), scale(forward, -bottomDepth))
  const g = add(add(bottomCenter, scale(side, bottomWidth)), scale(forward, bottomDepth))
  const h = add(add(bottomCenter, scale(side, -bottomWidth)), scale(forward, bottomDepth))

  addCharacterQuad(target, a, b, f, e, style.pants, 0.02, localReflection)
  addCharacterQuad(target, b, c, g, f, scale(style.pants, 0.88), 0.02, localReflection)
  addCharacterQuad(target, c, d, h, g, scale(style.pants, 0.78), 0.02, localReflection)
  addCharacterQuad(target, d, a, e, h, scale(style.pants, 0.88), 0.02, localReflection)
  addCharacterQuad(target, e, f, g, h, scale(style.pants, 0.68), 0.02, localReflection)
}

function addCharacterHair(target: Vertex[], pose: Map<string, Vec3>, mesh: HairMesh, player: { turn: number },
  color: Vec3)
{
  const head = pose.get('mixamorig:Head')!
  const top = pose.get('mixamorig:HeadTop_End')!
  const up = normalize(subtract(top, head))
  const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
  const forward: Vec3 = [Math.sin(player.turn), 0, Math.cos(player.turn)]
  const center = add(head, scale(up, -0.035))

  for (const face of mesh.faces) {
    const a = hairPoint(center, side, up, forward, mesh.points[face[0]!]!)
    const b = hairPoint(center, side, up, forward, mesh.points[face[1]!]!)
    const c = hairPoint(center, side, up, forward, mesh.points[face[2]!]!)

    if (triangleAreaSquared(a, b, c) > 0.00000001) {
      addLitTriangle(target, a, b, c, color, 0)
    }
  }
}

function triangleAreaSquared(a: Vec3, b: Vec3, c: Vec3) {
  return dot(cross(subtract(c, a), subtract(b, a)), cross(subtract(c, a), subtract(b, a)))
}

function hairPoint(center: Vec3, side: Vec3, up: Vec3, forward: Vec3, point: Vec3) {
  const scaleAmount = 1.4
  const x = point[0] * scaleAmount
  const z = -(point[2] - 0.02) * scaleAmount - 0.055
  const y = (point[1] + 0.08) * scaleAmount - Math.max(0, z) * 0.28

  return add(add(add(center, scale(side, x)), scale(up, y)), scale(forward, z))
}

function addLitTriangle(target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, glow: number) {
  const center = scale(add(add(a, b), c), 1 / 3)
  const normal = normalize(cross(subtract(c, a), subtract(b, a)))
  const shade = addLocalReflection(color, center, normal)

  target.push(
    [a[0], a[1], a[2], shade[0], shade[1], shade[2], glow, 0, 0, 0, 0],
    [b[0], b[1], b[2], shade[0], shade[1], shade[2], glow, 0, 0, 0, 0],
    [c[0], c[1], c[2], shade[0], shade[1], shade[2], glow, 0, 0, 0, 0],
  )
}

function addSunLitTriangle(target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3) {
  const center = scale(add(add(a, b), c), 1 / 3)
  const normal = normalize(cross(subtract(c, a), subtract(b, a)))
  const sun = normalize(subtract([10.5, 6.8, outsideBounds.front], center))
  const diffuse = Math.abs(dot(normal, sun))
  const lift = clamp((normal[1] + 1) * 0.5, 0, 1)
  const night = outsideMotif === 'night'
  const treeLights: Vec3[] = [
    [outsideTree.x - outsideTree.radius * 2.5, characterFloor - 0.35, outsideTree.z + outsideTree.radius * 0.85],
    [outsideTree.x + outsideTree.radius * 2.5, characterFloor - 0.35, outsideTree.z + outsideTree.radius * 0.85],
    [outsideTree.x, characterFloor - 0.35, outsideTree.z - outsideTree.radius * 2.5],
  ]
  let uplight = 0

  for (const light of treeLights) {
    const toLight = subtract(light, center)
    const distance = Math.hypot(toLight[0], toLight[1], toLight[2])
    const fromLight = normalize(subtract(center, light))
    const vertical = clamp(dot(fromLight, [0, 1, 0]), 0, 1)
    const facing = clamp(dot(normal, scale(fromLight, -1)), 0, 1)
    const cone = smoothstep(0.58, 0.96, vertical)

    uplight += facing * cone * clamp(1 - distance / 8, 0, 1)
  }

  const light = 0.34 + diffuse * 0.86 + lift * 0.18
  const warmth: Vec3 = [1.1, 1.03, 0.86]
  const baseLight = night ? light * 0.22 + lift * 0.04 : light
  const blueLight = night ? uplight * 2.1 : 0
  const shade: Vec3 = [
    clamp(color[0] * baseLight * warmth[0] + blueLight * electricNavy[0], 0, 1),
    clamp(color[1] * baseLight * warmth[1] + blueLight * electricNavy[1], 0, 1),
    clamp(color[2] * baseLight * warmth[2] + blueLight * electricNavy[2], 0, 1),
  ]

  target.push(
    [a[0], a[1], a[2], shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
    [b[0], b[1], b[2], shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
    [c[0], c[1], c[2], shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
  )
}

function addCharacterBox(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  width: number,
  depth: number,
  color: Vec3,
  glow: number,
  turn: number,
  localReflection: boolean,
  strobe = 0,
) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const length = Math.hypot(dx, dy, dz)
  const nx = dx / length
  const ny = dy / length
  const nz = dz / length
  const vertical = Math.abs(ny) > 0.82
  let sideX = 0
  let sideY = 0
  let sideZ = 0
  let upX = 0
  let upY = 0
  let upZ = 0

  if (vertical) {
    sideX = Math.cos(turn)
    sideZ = -Math.sin(turn)
    upX = Math.sin(turn)
    upZ = Math.cos(turn)
  }
  else {
    const sideLength = Math.hypot(-nz, nx)

    sideX = -nz / sideLength
    sideZ = nx / sideLength
    upX = -sideZ * ny
    upY = sideZ * nx - sideX * nz
    upZ = sideX * ny

    const upLength = Math.hypot(upX, upY, upZ)

    upX /= upLength
    upY /= upLength
    upZ /= upLength
  }

  sideX *= width * 0.5
  sideY *= width * 0.5
  sideZ *= width * 0.5
  upX *= depth * 0.5
  upY *= depth * 0.5
  upZ *= depth * 0.5

  if (!localReflection) {
    addCharacterBoxInstance(a, b, [sideX, sideY, sideZ], [upX, upY, upZ], color, glow, strobe)
    return
  }

  const a0: Vec3 = [a[0] - sideX - upX, a[1] - sideY - upY, a[2] - sideZ - upZ]
  const a1: Vec3 = [a[0] + sideX - upX, a[1] + sideY - upY, a[2] + sideZ - upZ]
  const a2: Vec3 = [a[0] + sideX + upX, a[1] + sideY + upY, a[2] + sideZ + upZ]
  const a3: Vec3 = [a[0] - sideX + upX, a[1] - sideY + upY, a[2] - sideZ + upZ]
  const b0: Vec3 = [b[0] - sideX - upX, b[1] - sideY - upY, b[2] - sideZ - upZ]
  const b1: Vec3 = [b[0] + sideX - upX, b[1] + sideY - upY, b[2] + sideZ - upZ]
  const b2: Vec3 = [b[0] + sideX + upX, b[1] + sideY + upY, b[2] + sideZ + upZ]
  const b3: Vec3 = [b[0] - sideX + upX, b[1] - sideY + upY, b[2] - sideZ + upZ]
  const shadeA = scale(color, 0.65)
  const shadeB = scale(color, 0.82)

  addCharacterQuad(target, a0, a1, b1, b0, shadeA, glow, localReflection)
  addCharacterQuad(target, a1, a2, b2, b1, color, glow, localReflection)
  addCharacterQuad(target, a2, a3, b3, b2, shadeB, glow, localReflection)
  addCharacterQuad(target, a3, a0, b0, b3, shadeA, glow, localReflection)
  addCharacterQuad(target, a3, a2, a1, a0, shadeB, glow, localReflection)
  addCharacterQuad(target, b0, b1, b2, b3, shadeB, glow, localReflection)
}

function addCharacterBoxInstance(
  a: Vec3,
  b: Vec3,
  side: Vec3,
  up: Vec3,
  color: Vec3,
  glow: number,
  strobe: number,
) {
  characterBoxInstances.push(
    a[0],
    a[1],
    a[2],
    b[0],
    b[1],
    b[2],
    side[0],
    side[1],
    side[2],
    up[0],
    up[1],
    up[2],
    color[0],
    color[1],
    color[2],
    glow,
    strobe,
  )
}

function addCharacterQuad(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: Vec3,
  glow: number,
  localReflection: boolean,
) {
  if (localReflection) {
    addLitQuad(target, a, b, c, d, color, glow)
  }
  else {
    addQuad(target, a, b, c, d, color, glow)
  }
}

function addLitQuad(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: Vec3,
  glow: number,
) {
  const center = scale(add(add(a, b), add(c, d)), 0.25)
  const normal = normalize(cross(subtract(c, a), subtract(b, a)))

  addQuad(target, a, b, c, d, addLocalReflection(color, center, normal), glow)
}

function addLocalReflection(color: Vec3, point: Vec3, normal: Vec3): Vec3 {
  const red = redReflection(point, normal)
  const white = strobeReflection(point, normal)

  return [
    clamp(color[0] + red * 1.45 + white * 2.85, 0, 1),
    clamp(color[1] + red * 0.06 + white * 2.7, 0, 1),
    clamp(color[2] + red * 0.03 + white * 2.25, 0, 1),
  ]
}

function redReflection(point: Vec3, normal: Vec3) {
  if (Math.abs(normal[0]) > Math.abs(normal[2])) {
    const x = normal[0] > 0 ? 6.98 : -6.98
    const z = nearestValue(wallLightZ, point[2])

    return redLightAmount(point, normal, x, point[1], z)
  }

  const z = normal[2] > 0 ? 3.98 : -23.98
  const x = nearestValue(backLightX, point[0])

  return redLightAmount(point, normal, x, point[1], z)
}

function nearestValue(values: number[], target: number) {
  let next = values[0]!
  let distance = Math.abs(target - next)

  for (let i = 1; i < values.length; i++) {
    const value = values[i]!
    const nextDistance = Math.abs(target - value)

    if (nextDistance < distance) {
      next = value
      distance = nextDistance
    }
  }

  return next
}

function redLightAmount(point: Vec3, normal: Vec3, x: number, y: number, z: number) {
  const dx = x - point[0]
  const dy = y - point[1]
  const dz = z - point[2]
  const distance = Math.hypot(dx, dz)
  const length = Math.hypot(dx, dy, dz)
  const facing = Math.max(0, (normal[0] * dx + normal[1] * dy + normal[2] * dz) / length)
  const height = 0.8 + Math.max(0, point[1] + 1.95) * 0.18

  return Math.exp(-distance * 0.95) * facing * Math.sqrt(facing) * height * 1.65
}

function strobeReflection(point: Vec3, normal: Vec3) {
  let amount = 0
  const active = activeStrobeReflectionLights()

  for (const setup of active) {
    amount = Math.max(amount, strobeLightAmount(point, normal, setup.light, setup.target))
  }

  return amount
}

function activeStrobeReflectionLights() {
  if (strobeReflectionFrame !== lightFrame) {
    strobeReflectionLights = []
    strobeReflectionFrame = lightFrame

    for (const light of strobeLights) {
      const strobe = Math.floor(strobeRandom(light.id, lightFrame) + 0.18)

      if (strobe > 0) {
        strobeReflectionLights.push({
          light,
          target: strobeTarget(light, lightFrame / 60),
        })
      }
    }
  }

  return strobeReflectionLights
}

function restoreState() {
  const state = readClubState(saveKey)

  if (state) {
    setVec3(characterPosition, state.character)
    setVec3(camera.position, state.camera)
    camera.turn = state.cameraTurn
    characterTurn = state.characterTurn
    velocityY = state.velocityY
    characterHairIndex = state.characterHairIndex ?? characterHairIndex
    characterHairColorIndex = normalizeIndex(state.characterHairColorIndex ?? characterHairColorIndex,
      hairPalette.length)
    topStyleIndex = normalizeIndex(state.topStyleIndex ?? state.shirtColorIndex ?? topStyleIndex,
      jewelPalette.length * 2 + 2)
    bottomStyleIndex = normalizeIndex(state.bottomStyleIndex ?? state.pantsColorIndex ?? bottomStyleIndex,
      jewelPalette.length * 2)
    djVideoUi.times.inside = state.videoTimes?.inside ?? djVideoUi.times.inside
    djVideoUi.times.outside = state.videoTimes?.outside ?? djVideoUi.times.outside
    setTopStyle()
    setBottomStyle()
  }
}

function saveState() {
  djVideoUi.syncCurrentTime()

  writeClubState(saveKey, {
    character: characterPosition,
    camera: camera.position,
    cameraTurn: camera.turn,
    characterTurn,
    velocityY,
    characterHairIndex,
    characterHairColorIndex,
    shirtColorIndex,
    topStyleIndex,
    pantsColorIndex,
    bottomStyleIndex,
    videoTimes: djVideoUi.times,
  })
}

function updateSave(delta: number) {
  saveTime += delta

  if (saveTime >= 0.5) {
    saveState()
    saveTime = 0
  }
}

function getInput() {
  return readMoveInput(keys, input)
}

function updateCharacter(delta: number) {
  getInput()
  const moving = lengthSq(input) > 0

  characterMotionBlend = mix(characterMotionBlend, moving ? 1 : 0, 1 - Math.exp(-8 * delta))
  characterMode = characterMotionBlend > 0.5 ? 'run' : 'stand'

  if (moving) {
    normalizeInto(input)
    setVec3(forward, [Math.sin(camera.turn), 0, Math.cos(camera.turn)])
    setVec3(right, [-Math.cos(camera.turn), 0, Math.sin(camera.turn)])
    setVec3(direction, add(scale(forward, input[2]), scale(right, input[0])))
    normalizeInto(direction)

    characterPosition[0] += direction[0] * delta * 5
    characterPosition[2] += direction[2] * delta * 5
    collideRoom(characterPosition, outsideTree)
    characterTurn = smoothAngle(characterTurn, Math.atan2(direction[0], direction[2]), 10, delta)
  }
  floorY = walkHeight(characterPosition[0], characterPosition[1], characterPosition[2])

  if (floorY > characterPosition[1]) {
    characterPosition[1] = floorY
    velocityY = 0
  }
  else {
    velocityY -= 12 * delta
    characterPosition[1] += velocityY * delta

    if (characterPosition[1] < floorY) {
      characterPosition[1] = floorY
      velocityY = 0
    }
  }

  collideRoom(characterPosition, outsideTree)
}

function updateCamera(delta: number) {
  getInput()
  camera.update(delta, input, characterTurn)
}

function getCamera() {
  return camera.get()
}

function openChatInput() {
  chatUi.open()
}

function cycleHair(direction: number) {
  if (characterHairMeshes.length === 0) {
    return
  }

  characterHairIndex = normalizeIndex(characterHairIndex + direction, characterHairMeshes.length + 1)
  setCharacterHair()
  logCurrentHair()
}

function setCharacterHair() {
  characterHair = characterHairIndex === 0 ? undefined : characterHairMeshes[characterHairIndex - 1]!
}

function logCurrentHair() {
  console.log(`Current hair ${characterHairIndex}: ${characterHair?.name ?? 'no hair'}`)
}

function cycleHairColor(direction: number) {
  characterHairColorIndex = normalizeIndex(characterHairColorIndex + direction, hairPalette.length)
}

function cycleShirt(direction: number) {
  topStyleIndex = normalizeIndex(topStyleIndex + direction, jewelPalette.length * 2 + 2)
  setTopStyle()
}

function setTopStyle() {
  const style = applyTopStyle(topStyleIndex)

  topMode = style.mode
  shirtColorIndex = style.colorIndex
}

function cyclePants(direction: number) {
  bottomStyleIndex = normalizeIndex(bottomStyleIndex + direction, jewelPalette.length * 2)
  setBottomStyle()
}

function setBottomStyle() {
  const style = applyBottomStyle(bottomStyleIndex)

  bottomMode = style.mode
  pantsColorIndex = style.colorIndex
}

function playerHair(index: number) {
  if (index === 0 || characterHairMeshes.length === 0) {
    return undefined
  }

  return characterHairMeshes[normalizeIndex(index - 1, characterHairMeshes.length)]!
}
