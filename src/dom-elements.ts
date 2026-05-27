export function getDomElements() {
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

  return {
    canvas,
    djVideo,
    chatForm,
    chatInput,
    chatBubble,
  }
}
