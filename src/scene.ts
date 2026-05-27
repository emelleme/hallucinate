import { characterFloor } from './character-data.ts'
import { clamp } from './math.ts'
import { backDoor, bartenderBar, bartenderStools, djBooth, djSpeakers, outsideBounds, outsideDjBooth, outsideDjSpeakers,
  roomBounds } from './scene-data.ts'
import type { Bounds, CircleBounds, Vec3 } from './types.ts'

export function walkHeight(_x: number, _y: number, _z: number) {
  return characterFloor
}

function isAtBackDoor(position: Vec3) {
  return Math.abs(position[0] - backDoor.x) < backDoor.width * 0.5
}

export function isOutside(position: Vec3) {
  return position[0] < roomBounds.left || position[0] > roomBounds.right || position[2] < roomBounds.back
    || position[2] > roomBounds.front
}

export function usesSkyBackground(_camera: { eye: Vec3; center: Vec3 }) {
  return true
}

export function collideRoom(position: Vec3, outsideTree: CircleBounds) {
  const insideLeft = roomBounds.left + 0.8
  const insideRight = roomBounds.right - 0.8
  const insideBack = roomBounds.back + 0.8
  const insideFront = roomBounds.front - 0.8
  const outside = isOutside(position)

  if (outside) {
    position[0] = clamp(position[0], outsideBounds.left, outsideBounds.right)
    position[2] = clamp(position[2], outsideBounds.back, outsideBounds.front)
    collideBuildingWalls(position, 0.45)
    collideCircle(position, outsideTree)
    collideBounds(position, outsideDjBooth)

    for (const speaker of outsideDjSpeakers) {
      collideBounds(position, speaker)
    }

    return
  }

  position[0] = clamp(position[0], insideLeft, insideRight)

  if (position[2] > insideFront && !isAtBackDoor(position)) {
    position[2] = insideFront
  }
  else {
    position[2] = clamp(position[2], insideBack, roomBounds.front + 0.45)
  }

  collideBounds(position, djBooth)
  collideBounds(position, bartenderBar)

  for (const stool of bartenderStools) {
    collideBounds(position, stool)
  }

  for (const speaker of djSpeakers) {
    collideBounds(position, speaker)
  }
}

export function collideBuildingWalls(position: Vec3, padding: number) {
  const left = roomBounds.left - padding
  const right = roomBounds.right + padding
  const back = roomBounds.back - padding
  const front = roomBounds.front + padding

  if (position[0] > left && position[0] < right && position[2] > back && position[2] < front) {
    if (isAtBackDoor(position) && position[2] > roomBounds.front - 0.8) {
      return
    }

    const pushLeft = Math.abs(position[0] - left)
    const pushRight = Math.abs(right - position[0])
    const pushBack = Math.abs(position[2] - back)
    const pushFront = Math.abs(front - position[2])
    const push = Math.min(pushLeft, pushRight, pushBack, pushFront)

    if (push === pushLeft) {
      position[0] = left
    }
    else if (push === pushRight) {
      position[0] = right
    }
    else if (push === pushBack) {
      position[2] = back
    }
    else {
      position[2] = front
    }
  }
}

function collideBounds(position: Vec3, bounds: Bounds) {
  const padding = 0.28
  const left = bounds.x - bounds.width / 2 - padding
  const right = bounds.x + bounds.width / 2 + padding
  const front = bounds.z + bounds.depth / 2 + padding
  const back = bounds.z - bounds.depth / 2 - padding

  if (position[0] > left && position[0] < right && position[2] > back && position[2] < front) {
    const pushLeft = Math.abs(position[0] - left)
    const pushRight = Math.abs(right - position[0])
    const pushBack = Math.abs(position[2] - back)
    const pushFront = Math.abs(front - position[2])
    const push = Math.min(pushLeft, pushRight, pushBack, pushFront)

    if (push === pushLeft) {
      position[0] = left
    }
    else if (push === pushRight) {
      position[0] = right
    }
    else if (push === pushBack) {
      position[2] = back
    }
    else {
      position[2] = front
    }
  }
}

function collideCircle(position: Vec3, bounds: CircleBounds) {
  const x = position[0] - bounds.x
  const z = position[2] - bounds.z
  const distance = Math.hypot(x, z)
  const radius = bounds.radius + 0.28

  if (distance < radius) {
    position[0] = bounds.x + x / distance * radius
    position[2] = bounds.z + z / distance * radius
  }
}
