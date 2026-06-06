import { outsidePhotoWall } from './scene-data.ts'

export const photoWallColumns = 3
export const photoWallRows = 3
export const photoWallPaintedRows = photoWallRows + 1
export const photoWallPaintedSlots = photoWallColumns * photoWallPaintedRows
export const photoWallScale = 120
export const photoWallThumbnailWidth = Math.ceil(outsidePhotoWall.width * photoWallScale / photoWallColumns)
export const photoWallThumbnailHeight = Math.ceil(outsidePhotoWall.height * photoWallScale / photoWallRows)
