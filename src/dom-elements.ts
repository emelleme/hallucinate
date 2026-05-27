export function getDomElements() {
  const canvas = document.createElement('canvas')
  const djVideo = document.createElement('div')
  const chatForm = document.createElement('form')
  const chatInput = document.createElement('input')
  const chatBubble = document.createElement('div')
  const intro = document.createElement('div')
  const introProgress = document.createElement('div')

  canvas.id = 'scene'
  canvas.className = 'block h-dvh w-dvw'

  djVideo.id = 'dj-video'
  djVideo.className = 'absolute border-0 opacity-0'

  chatForm.id = 'chat-form'
  chatForm.className = 'absolute opacity-0'

  chatInput.id = 'chat-input'
  chatInput.maxLength = 80
  chatInput.autocomplete = 'off'

  chatBubble.id = 'chat-bubble'
  chatBubble.className = 'absolute opacity-0'

  intro.id = 'intro'
  introProgress.id = 'intro-progress'
  introProgress.textContent = '0%'

  chatForm.append(chatInput)
  intro.append(introProgress)
  document.body.prepend(canvas, djVideo, chatForm, chatBubble, intro)

  return {
    canvas,
    djVideo,
    chatForm,
    chatInput,
    chatBubble,
    intro,
    introProgress,
  }
}
