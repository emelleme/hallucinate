import { outsidePhotoWall } from './scene-data.ts'

export const photoWallColumns = 3
export const photoWallRows = 3
export const photoWallPaintedRows = photoWallRows + 1
export const photoWallPaintedSlots = photoWallColumns * photoWallPaintedRows
export const photoWallScale = 120
export const photoWallSurfaceOffset = 0.035
export const photoWallSurface = {
  ...outsidePhotoWall,
  x: outsidePhotoWall.x + outsidePhotoWall.normal[0] * photoWallSurfaceOffset,
  z: outsidePhotoWall.z + outsidePhotoWall.normal[2] * photoWallSurfaceOffset,
}
export const photoWallWidth = photoWallSurface.width * photoWallScale
export const photoWallHeight = photoWallSurface.height * photoWallScale
export const photoWallSlotWidth = photoWallWidth / photoWallColumns
export const photoWallSlotHeight = photoWallHeight / photoWallRows
export const photoWallThumbnailWidth = Math.ceil(photoWallSlotWidth)
export const photoWallThumbnailHeight = Math.ceil(photoWallSlotHeight)

export function photoWallSlot(index: number, scroll: number) {
  return {
    height: photoWallSlotHeight,
    width: photoWallSlotWidth,
    x: index % photoWallColumns * photoWallSlotWidth,
    y: Math.floor(index / photoWallColumns) * photoWallSlotHeight - scroll,
  }
}
