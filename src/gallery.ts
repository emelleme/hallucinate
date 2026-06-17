import './gallery.css'

type PhotoPayload = {
  timestamp: number
  createdAt: number
  url: string
  thumbnailUrl: string
  likes: number
  liked: boolean
}

type PhotoPagePayload = {
  offset: number
  photos: PhotoPayload[]
  total: number
}

const grid = document.querySelector('#grid') as HTMLElement
const status = document.querySelector('#status') as HTMLElement
const viewer = document.querySelector('#viewer') as HTMLDialogElement
const viewerStage = document.querySelector('#viewer-stage') as HTMLElement
const viewerImage = document.querySelector('#viewer-image') as HTMLImageElement
const viewerPolaroid = document.querySelector('#viewer-polaroid') as HTMLElement
const previous = document.querySelector('#previous') as HTMLButtonElement
const next = document.querySelector('#next') as HTMLButtonElement
const like = document.querySelector('#like') as HTMLButtonElement
const share = document.querySelector('#share') as HTMLButtonElement
const close = document.querySelector('#close') as HTMLButtonElement
const photos: PhotoPayload[] = []
const elements = new Map<number, { badge: HTMLElement; button: HTMLElement }>()
const preloads = new Map<string, Promise<void>>()
const observer = new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting)) {
    loadVisiblePages().catch(e => fail(e))
  }
}, { rootMargin: '900px' })

let loading = false
let loadingPage: Promise<void> | undefined
let offset = 0
let total = Number.POSITIVE_INFINITY
let viewerAnimation: Animation | undefined
let viewerSlideBusy = false
let swipeStart: { id: number; x: number; y: number } | undefined
let viewedPhoto: PhotoPayload | undefined

observer.observe(status)
openPermalinkPhoto().catch(e => fail(e))
close.addEventListener('click', () => closeViewer())
previous.addEventListener('click', () => moveViewer(-1).catch(e => fail(e)))
next.addEventListener('click', () => moveViewer(1).catch(e => fail(e)))
like.addEventListener('click', () => {
  if (!viewedPhoto) {
    throw new Error('Missing viewed photo')
  }

  likePhoto(viewedPhoto).catch(e => fail(e))
})
share.addEventListener('click', () => {
  if (!viewedPhoto) {
    throw new Error('Missing viewed photo')
  }

  sharePhoto(viewedPhoto, share).catch(e => fail(e))
})
viewer.addEventListener('cancel', event => {
  event.preventDefault()
  closeViewer()
})
viewer.addEventListener('click', event => {
  if (event.target === viewer || event.target === viewerStage) {
    closeViewer()
  }
})
viewer.addEventListener('keydown', event => {
  if (event.key === 'Escape' || event.key.toLowerCase() === 'x') {
    event.preventDefault()
    closeViewer()
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    moveViewer(-1).catch(e => fail(e))
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    moveViewer(1).catch(e => fail(e))
  }
})
viewerStage.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch' || event.target instanceof HTMLButtonElement) {
    return
  }

  swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY }
  viewerStage.setPointerCapture(event.pointerId)
})
viewerStage.addEventListener('pointerup', event => {
  if (!swipeStart || event.pointerId !== swipeStart.id) {
    return
  }

  const x = event.clientX - swipeStart.x
  const y = event.clientY - swipeStart.y

  swipeStart = undefined
  if (Math.abs(x) < 46 || Math.abs(x) < Math.abs(y) * 1.4) {
    return
  }

  moveViewer(x < 0 ? 1 : -1).catch(e => fail(e))
})
viewerStage.addEventListener('pointercancel', event => {
  if (swipeStart?.id === event.pointerId) {
    swipeStart = undefined
  }
})

async function loadNextPage() {
  if (loadingPage) {
    return await loadingPage
  }

  if (offset >= total) {
    return
  }

  loadingPage = appendNextPage()
  await loadingPage
  loadingPage = undefined
}

async function loadVisiblePages() {
  while (offset < total && statusVisible()) {
    await loadNextPage()
    await animationFrame()
  }
}

async function appendNextPage() {
  loading = true
  renderStatus('Loading')
  const page = await fetchPhotoPage(offset)

  offset = page.offset + page.photos.length
  total = page.total
  for (const photo of page.photos) {
    upsertPhoto(photo)
  }

  renderStatus(offset < total ? 'Loading more' : (total ? '' : 'No photos yet'))
  loading = false
  syncViewerNav()
}

function photoElement(photo: PhotoPayload) {
  const item = document.createElement('div')
  const button = document.createElement('button')
  const image = document.createElement('img')
  const badge = document.createElement('span')
  const date = new Date(photo.createdAt).toLocaleString()

  item.className = 'photo'
  button.className = 'photo-open'
  button.type = 'button'
  button.setAttribute('aria-label', 'open photo from ' + date)
  badge.className = 'photo-like'
  image.alt = date
  image.decoding = 'async'
  image.loading = 'lazy'
  image.src = photo.thumbnailUrl
  image.onerror = () => console.error(new Error('Gallery thumbnail failed ' + photo.thumbnailUrl))
  button.addEventListener('click', () => openViewer(photo))
  button.append(image)
  item.append(button, badge)
  elements.set(photo.timestamp, { badge, button: item })
  syncPhotoElement(photo)

  return item
}

async function openPermalinkPhoto() {
  const timestamp = permalinkTimestamp()

  if (!timestamp) {
    return
  }

  const photo = await fetchPhoto(timestamp)

  upsertPhoto(photo)
  await openViewer(photo)
}

function upsertPhoto(photo: PhotoPayload) {
  const existing = photos.findIndex(item => item.timestamp === photo.timestamp)

  if (existing >= 0) {
    photos[existing] = photo
    syncPhotoElement(photo)
    return
  }

  photos.push(photo)
  photos.sort((a, b) => b.createdAt === a.createdAt ? b.timestamp - a.timestamp : b.createdAt - a.createdAt)
  renderPhotos()
}

function renderPhotos() {
  grid.replaceChildren()
  elements.clear()
  for (const photo of photos) {
    grid.append(photoElement(photo))
  }
}

async function openViewer(photo: PhotoPayload) {
  await setViewerPhoto(photo)
  viewer.showModal()
}

function closeViewer() {
  if (viewer.open) {
    viewer.close()
  }
}

async function moveViewer(direction: number) {
  if (!viewedPhoto) {
    throw new Error('Missing viewed photo')
  }

  if (viewerAnimation || viewerSlideBusy) {
    return
  }

  viewerSlideBusy = true
  let index = photoIndex(viewedPhoto)

  try {
    if (direction > 0 && index >= photos.length - 2 && photos.length < total) {
      await loadNextPage()
      index = photoIndex(viewedPhoto)
    }

    const photo = photos[index + direction]

    if (photo) {
      await animateViewerSwap(photo, direction)
      return
    }

    viewerSlideBusy = false
  }
  catch (e) {
    viewerSlideBusy = false
    throw e
  }
}

async function setViewerPhoto(photo: PhotoPayload, syncNav = true) {
  const index = photoIndex(photo)
  const date = new Date(photo.createdAt).toLocaleString()
  const tilt = photoTilt(photo)

  viewerImage.src = photo.url
  viewerImage.alt = date
  viewerPolaroid.style.setProperty('--viewer-tilt', tilt + 'deg')
  viewedPhoto = photo
  clearCopied(share)
  syncLikeButton(like, photo)
  if (syncNav) {
    syncViewerNav()
  }
  preloadNeighbors(index)
  await viewerImage.decode()

  return tilt
}

async function animateViewerSwap(photo: PhotoPayload, direction: number) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await setViewerPhoto(photo)
    viewerSlideBusy = false
    return
  }

  await preloadFullPhoto(photo)
  const currentRect = viewerPolaroid.getBoundingClientRect()
  const currentImageRect = viewerImage.getBoundingClientRect()
  const currentPhoto = viewedPhoto!
  const outgoing = createOutgoingSlide(currentRect, currentImageRect)
  const currentTilt = photoTilt(currentPhoto)
  const distance = slideDistance(currentRect)
  const incomingX = direction > 0 ? distance : -distance
  const outgoingX = -incomingX

  viewerAnimation?.cancel()
  viewerStage.append(outgoing)
  outgoing.getBoundingClientRect()
  await animationFrame()
  viewerPolaroid.style.visibility = 'hidden'
  let nextTilt
  try {
    nextTilt = await setViewerPhoto(photo, false)
  }
  catch (e) {
    outgoing.remove()
    viewerPolaroid.style.visibility = ''
    viewerPolaroid.style.transform = ''
    throw e
  }
  viewerPolaroid.style.transform = 'translateX(' + incomingX + 'px) rotate(' + nextTilt + 'deg)'
  viewerPolaroid.getBoundingClientRect()
  viewerPolaroid.style.visibility = ''

  const outgoingSlide = outgoing.animate([
    { transform: 'translateX(0) rotate(' + currentTilt + 'deg)' },
    { transform: 'translateX(' + outgoingX + 'px) rotate(' + currentTilt + 'deg)' },
  ], {
    duration: 420,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  })
  const incomingAnimation = viewerPolaroid.animate([
    { transform: 'translateX(' + incomingX + 'px) rotate(' + nextTilt + 'deg)' },
    { transform: 'translateX(0) rotate(' + nextTilt + 'deg)' },
  ], {
    duration: 420,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  })

  viewerAnimation = outgoingSlide
  incomingAnimation.addEventListener('finish', () => {
    outgoing.remove()
    viewerAnimation = undefined
    viewerSlideBusy = false
    viewerPolaroid.style.transform = ''
    syncViewerNav()
    close.focus()
  }, { once: true })
}

function createOutgoingSlide(rect: DOMRect, imageRect: DOMRect) {
  const slide = document.createElement('div')
  const image = document.createElement('img')

  slide.className = 'viewer-polaroid-slide'
  slide.style.height = rect.height + 'px'
  slide.style.maxHeight = 'none'
  slide.style.maxWidth = 'none'
  slide.style.pointerEvents = 'none'
  slide.style.width = rect.width + 'px'
  image.className = 'viewer-image'
  image.alt = viewerImage.alt
  image.src = viewerImage.currentSrc || viewerImage.src
  image.style.height = imageRect.height + 'px'
  image.style.maxHeight = 'none'
  image.style.maxWidth = 'none'
  image.style.width = imageRect.width + 'px'
  slide.append(image)

  return slide
}

function slideDistance(rect: DOMRect) {
  const margin = 28
  const leftDistance = rect.right + margin
  const rightDistance = innerWidth - rect.left + margin

  return Math.max(leftDistance, rightDistance)
}

function animationFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

function statusVisible() {
  const rect = status.getBoundingClientRect()

  return rect.top < innerHeight + 900 && rect.bottom >= -900
}

async function likePhoto(photo: PhotoPayload) {
  const response = await fetch('/api/photos/' + photo.timestamp + '/likes', { method: 'POST' })

  if (!response.ok) {
    throw new Error('Photo like failed ' + response.status)
  }

  updatePhotoLike(photo, await response.json())
}

async function sharePhoto(photo: PhotoPayload, button: HTMLButtonElement) {
  const url = photoPermalink(photo)

  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    await navigator.share({ title: 'hallucinate Gallery', url })
    return
  }

  await navigator.clipboard.writeText(url)
  showCopied(button)
}

function showCopied(button: HTMLButtonElement) {
  button.dataset.copied = 'true'
  clearTimeout(Number(button.dataset.copiedTimeout || 0))
  button.dataset.copiedTimeout = String(setTimeout(() => {
    clearCopied(button)
  }, 1400))
}

function clearCopied(button: HTMLButtonElement) {
  delete button.dataset.copied
  delete button.dataset.copiedTimeout
}

function photoPermalink(photo: PhotoPayload) {
  return location.origin + '/gallery/' + photo.timestamp
}

function permalinkTimestamp() {
  const match = /^\/gallery\/(\d+)$/.exec(location.pathname)

  return match ? Number(match[1]) : 0
}

function updatePhotoLike(photo: PhotoPayload, likeData: { liked: boolean; likes: number }) {
  const index = photoIndex(photo)
  const nextPhoto = { ...photos[index], liked: likeData.liked, likes: likeData.likes }

  photos[index] = nextPhoto
  viewedPhoto = viewedPhoto?.timestamp === nextPhoto.timestamp ? nextPhoto : viewedPhoto
  syncPhotoElement(nextPhoto)
  syncLikeButton(like, nextPhoto)
}

function syncPhotoElement(photo: PhotoPayload) {
  const element = elements.get(photo.timestamp)

  if (element) {
    element.badge.textContent = '❤️ ' + photo.likes
    element.badge.hidden = photo.likes === 0
  }
}

function syncLikeButton(button: HTMLButtonElement, photo: PhotoPayload) {
  button.disabled = photo.liked
  button.textContent = '❤️ ' + photo.likes
}

function syncViewerNav() {
  if (!viewedPhoto) {
    previous.disabled = true
    next.disabled = true
    return
  }

  const index = photoIndex(viewedPhoto)

  previous.disabled = index <= 0
  next.disabled = index >= total - 1 && photos.length >= total
}

function preloadNeighbors(index: number) {
  for (const photo of [photos[index - 1], photos[index + 1]]) {
    if (photo && !preloads.has(photo.url)) {
      preloads.set(photo.url, preloadFullPhoto(photo).catch(e => {
        preloads.delete(photo.url)
        console.error(e)
      }))
    }
  }
}

function preloadFullPhoto(photo: PhotoPayload) {
  const existing = preloads.get(photo.url)

  if (existing) {
    return existing
  }

  const image = new Image()

  image.src = photo.url
  const preload = image.decode()
  preloads.set(photo.url, preload)

  return preload
}

function photoIndex(photo: PhotoPayload) {
  const index = photos.findIndex(item => item.timestamp === photo.timestamp)

  if (index < 0) {
    throw new Error('Missing gallery photo ' + photo.timestamp)
  }

  return index
}

function photoTilt(photo: PhotoPayload) {
  const seed = Math.sin(photo.timestamp * 0.00037 + photo.createdAt * 0.000011) * 43758.5453123
  const unit = seed - Math.floor(seed)

  return unit * 5.6 - 2.8
}

function fail(e: any) {
  console.error(e)
  renderStatus('Gallery failed to load')
  loading = false
  loadingPage = undefined
}

function renderStatus(text: string) {
  status.replaceChildren()
  if (text) {
    status.textContent = text
    return
  }

  const joinBtn = document.createElement('a')

  joinBtn.className = 'join'
  joinBtn.href = '/'
  joinBtn.textContent = 'JOIN THE RAVE'
  status.append(joinBtn)
}

async function fetchPhotoPage(offsetVal: number): Promise<PhotoPagePayload> {
  const response = await fetch('/api/photos?offset=' + offsetVal, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('Gallery photos failed ' + response.status)
  }

  return await response.json()
}

async function fetchPhoto(timestampVal: number): Promise<PhotoPayload> {
  const response = await fetch('/api/photos/' + timestampVal, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('Gallery photo failed ' + response.status)
  }

  return await response.json()
}
