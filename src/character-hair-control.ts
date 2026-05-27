import { hairPalette } from './character-data.ts'
import { normalizeIndex } from './math.ts'
import type { HairMesh } from './types.ts'

export function createCharacterHairController() {
  let hair: HairMesh | undefined
  let index = 0
  let colorIndex = 0
  let meshes: HairMesh[] = []

  return {
    get colorIndex() {
      return colorIndex
    },
    set colorIndex(value: number) {
      colorIndex = normalizeIndex(value, hairPalette.length)
    },
    get hair() {
      return hair
    },
    get index() {
      return index
    },
    set index(value: number) {
      index = value
    },
    get meshes() {
      return meshes
    },
    setMeshes(value: HairMesh[], nextIndex: number) {
      meshes = value
      index = nextIndex
      this.setHair()
    },
    cycleColor(direction: number) {
      colorIndex = normalizeIndex(colorIndex + direction, hairPalette.length)
    },
    cycleHair(direction: number) {
      if (meshes.length === 0) {
        return
      }

      index = normalizeIndex(index + direction, meshes.length + 1)
      this.setHair()
      this.log()
    },
    setHair() {
      hair = index === 0 ? undefined : meshes[index - 1]!
    },
    log() {
      console.log(`Current hair ${index}: ${hair?.name ?? 'no hair'}`)
    },
  }
}
