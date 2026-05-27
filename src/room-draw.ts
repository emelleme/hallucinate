import { isOutside } from './scene.ts'
import type { Vec3 } from './types.ts'

type Camera = { eye: Vec3; center: Vec3 }

export function drawRoomDepth(options: {
  array: WebGLVertexArrayObject
  camera: Camera
  count: number
  gl: WebGL2RenderingContext
  height: number
  outside: boolean
  program: WebGLProgram
  treeShadowMap: WebGLTexture
  uniforms: {
    cameraCenter: WebGLUniformLocation
    cameraEye: WebGLUniformLocation
    renderZone: WebGLUniformLocation
    resolution: WebGLUniformLocation
    treeShadowSampler: WebGLUniformLocation
  }
  width: number
}) {
  options.gl.useProgram(options.program)
  options.gl.uniform2f(options.uniforms.resolution, options.width, options.height)
  options.gl.uniform3f(options.uniforms.cameraEye, options.camera.eye[0], options.camera.eye[1], options.camera.eye[2])
  options.gl.uniform3f(options.uniforms.cameraCenter, options.camera.center[0], options.camera.center[1],
    options.camera.center[2])
  options.gl.uniform1i(options.uniforms.renderZone, options.outside ? 1 : 0)
  options.gl.activeTexture(options.gl.TEXTURE4)
  options.gl.bindTexture(options.gl.TEXTURE_2D, options.treeShadowMap)
  options.gl.uniform1i(options.uniforms.treeShadowSampler, 4)
  options.gl.colorMask(false, false, false, false)
  options.gl.depthMask(true)
  options.gl.bindVertexArray(options.array)
  options.gl.drawArrays(options.gl.TRIANGLES, 0, options.count)
  options.gl.colorMask(true, true, true, true)
}

export function useRoomSmokeProgram(options: {
  camera: Camera
  gl: WebGL2RenderingContext
  height: number
  program: WebGLProgram
  smokeMap: WebGLTexture
  time: number
  uniforms: {
    cameraCenter: WebGLUniformLocation
    cameraEye: WebGLUniformLocation
    resolution: WebGLUniformLocation
    smokeMap: WebGLUniformLocation
    time: WebGLUniformLocation
  }
  width: number
}) {
  options.gl.useProgram(options.program)
  options.gl.uniform1f(options.uniforms.time, options.time)
  options.gl.uniform2f(options.uniforms.resolution, options.width, options.height)
  options.gl.uniform3f(options.uniforms.cameraEye, options.camera.eye[0], options.camera.eye[1], options.camera.eye[2])
  options.gl.uniform3f(options.uniforms.cameraCenter, options.camera.center[0], options.camera.center[1],
    options.camera.center[2])
  options.gl.activeTexture(options.gl.TEXTURE3)
  options.gl.bindTexture(options.gl.TEXTURE_2D, options.smokeMap)
  options.gl.uniform1i(options.uniforms.smokeMap, 3)
}

export function useLightProgram(options: {
  camera: Camera
  characterPosition: Vec3
  frame: number
  gl: WebGL2RenderingContext
  height: number
  program: WebGLProgram
  smokeMap: WebGLTexture
  uniforms: {
    cameraCenter: WebGLUniformLocation
    cameraEye: WebGLUniformLocation
    renderZone: WebGLUniformLocation
    resolution: WebGLUniformLocation
    smokeMap: WebGLUniformLocation
    time: WebGLUniformLocation
  }
  width: number
}) {
  options.gl.useProgram(options.program)
  options.gl.uniform1f(options.uniforms.time, options.frame)
  options.gl.uniform1i(options.uniforms.renderZone, isOutside(options.characterPosition) ? 1 : 0)
  options.gl.uniform2f(options.uniforms.resolution, options.width, options.height)
  options.gl.uniform3f(options.uniforms.cameraEye, options.camera.eye[0], options.camera.eye[1], options.camera.eye[2])
  options.gl.uniform3f(options.uniforms.cameraCenter, options.camera.center[0], options.camera.center[1],
    options.camera.center[2])
  options.gl.activeTexture(options.gl.TEXTURE2)
  options.gl.bindTexture(options.gl.TEXTURE_2D, options.smokeMap)
  options.gl.uniform1i(options.uniforms.smokeMap, 2)
}
