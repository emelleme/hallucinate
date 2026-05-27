import type { CharacterBoxGeometry } from './types.ts'

export function setupVertexArray(options: {
  array: WebGLVertexArrayObject
  buffer: WebGLBuffer
  data: AllowSharedBufferSource | number
  gl: WebGL2RenderingContext
  stride: number
  usage: number
}) {
  const gl = options.gl

  gl.bindVertexArray(options.array)
  gl.bindBuffer(gl.ARRAY_BUFFER, options.buffer)
  if (typeof options.data === 'number') {
    gl.bufferData(gl.ARRAY_BUFFER, options.data, options.usage)
  }
  else {
    gl.bufferData(gl.ARRAY_BUFFER, options.data, options.usage)
  }
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, options.stride, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, options.stride, 3 * Float32Array.BYTES_PER_ELEMENT)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, options.stride, 6 * Float32Array.BYTES_PER_ELEMENT)
  gl.enableVertexAttribArray(3)
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, options.stride, 7 * Float32Array.BYTES_PER_ELEMENT)
  gl.enableVertexAttribArray(4)
  gl.vertexAttribPointer(4, 2, gl.FLOAT, false, options.stride, 8 * Float32Array.BYTES_PER_ELEMENT)
  gl.enableVertexAttribArray(5)
  gl.vertexAttribPointer(5, 1, gl.FLOAT, false, options.stride, 10 * Float32Array.BYTES_PER_ELEMENT)
  gl.bindVertexArray(null)
}

export function setupStrobeArray(options: {
  array: WebGLVertexArrayObject
  geometry: CharacterBoxGeometry
  geometryBuffer: WebGLBuffer
  gl: WebGL2RenderingContext
  instanceBuffer: WebGLBuffer
  instanceStride: number
}) {
  const gl = options.gl

  gl.bindVertexArray(options.array)
  gl.bindBuffer(gl.ARRAY_BUFFER, options.geometryBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, options.geometry.data, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 4 * Float32Array.BYTES_PER_ELEMENT)
  gl.bindBuffer(gl.ARRAY_BUFFER, options.instanceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, options.instanceStride, 0)
  gl.vertexAttribDivisor(2, 1)
  gl.enableVertexAttribArray(3)
  gl.vertexAttribPointer(3, 3, gl.FLOAT, false, options.instanceStride, 3 * Float32Array.BYTES_PER_ELEMENT)
  gl.vertexAttribDivisor(3, 1)
  gl.enableVertexAttribArray(4)
  gl.vertexAttribPointer(4, 3, gl.FLOAT, false, options.instanceStride, 6 * Float32Array.BYTES_PER_ELEMENT)
  gl.vertexAttribDivisor(4, 1)
  gl.enableVertexAttribArray(5)
  gl.vertexAttribPointer(5, 3, gl.FLOAT, false, options.instanceStride, 9 * Float32Array.BYTES_PER_ELEMENT)
  gl.vertexAttribDivisor(5, 1)
  gl.enableVertexAttribArray(6)
  gl.vertexAttribPointer(6, 2, gl.FLOAT, false, options.instanceStride, 12 * Float32Array.BYTES_PER_ELEMENT)
  gl.vertexAttribDivisor(6, 1)
  gl.bindVertexArray(null)
}

export function setupCharacterBoxArray(options: {
  array: WebGLVertexArrayObject
  geometry: CharacterBoxGeometry
  geometryBuffer: WebGLBuffer
  gl: WebGL2RenderingContext
  instanceBuffer: WebGLBuffer
  instanceStride: number
}) {
  const gl = options.gl

  gl.bindVertexArray(options.array)
  gl.bindBuffer(gl.ARRAY_BUFFER, options.geometryBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, options.geometry.data, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT)
  gl.bindBuffer(gl.ARRAY_BUFFER, options.instanceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW)

  for (let i = 0; i < 5; i++) {
    const location = 2 + i

    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, options.instanceStride, i * 3 * Float32Array.BYTES_PER_ELEMENT)
    gl.vertexAttribDivisor(location, 1)
  }

  gl.enableVertexAttribArray(7)
  gl.vertexAttribPointer(7, 1, gl.FLOAT, false, options.instanceStride, 15 * Float32Array.BYTES_PER_ELEMENT)
  gl.vertexAttribDivisor(7, 1)
  gl.enableVertexAttribArray(8)
  gl.vertexAttribPointer(8, 1, gl.FLOAT, false, options.instanceStride, 16 * Float32Array.BYTES_PER_ELEMENT)
  gl.vertexAttribDivisor(8, 1)
  gl.bindVertexArray(null)
}

export function setupPostArray(options: {
  array: WebGLVertexArrayObject
  buffer: WebGLBuffer
  gl: WebGL2RenderingContext
}) {
  const gl = options.gl

  gl.bindVertexArray(options.array)
  gl.bindBuffer(gl.ARRAY_BUFFER, options.buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
}
