export function getDomElements() {
  const canvas = document.createElement('canvas')
  const djVideo = document.createElement('div')
  const chatForm = document.createElement('form')
  const nicknameInput = document.createElement('input')
  const chatInput = document.createElement('input')
  const chatSubmit = document.createElement('button')
  const chatBubble = document.createElement('div')
  const onlineIndicator = document.createElement('div')
  const onlineCount = document.createElement('div')
  const chatLog = document.createElement('div')
  const reactionButtons = document.createElement('div')
  const supportLink = document.createElement('a')
  const intro = document.createElement('div')
  const introPanel = document.createElement('div')
  const introLogo = document.createElement('div')
  const introLogoTitle = document.createElement('div')
  const introLogoSubtext = document.createElement('div')
  const introStart = document.createElement('button')
  const introTrack = document.createElement('div')
  const introBar = document.createElement('div')
  const introProgress = document.createElement('div')

  canvas.id = 'scene'
  canvas.className = 'block h-dvh w-dvw'
  canvas.tabIndex = -1

  djVideo.id = 'dj-video'
  djVideo.className = 'absolute border-0 opacity-0'

  chatForm.id = 'chat-form'
  chatForm.className = 'absolute opacity-0'

  nicknameInput.id = 'nickname-input'
  nicknameInput.maxLength = 32
  nicknameInput.placeholder = 'nickname'
  nicknameInput.setAttribute('autocomplete', 'nickname')

  chatInput.id = 'chat-input'
  chatInput.maxLength = 120
  chatInput.autocomplete = 'off'

  chatSubmit.type = 'submit'
  chatSubmit.hidden = true

  chatBubble.id = 'chat-bubble'
  chatBubble.className = 'absolute left-0 top-0 z-20'

  onlineIndicator.id = 'online-indicator'
  onlineCount.id = 'online-count'
  onlineCount.textContent = '0 online'
  chatLog.id = 'chat-log'
  reactionButtons.id = 'reaction-buttons'

  supportLink.id = 'support-link'
  supportLink.href = 'https://buymeacoffee.com/stagas'
  supportLink.target = '_blank'
  supportLink.rel = 'noopener noreferrer'
  supportLink.textContent = '💊'

  intro.id = 'intro'
  introPanel.id = 'intro-panel'
  introLogo.id = 'intro-logo'
  introLogoTitle.id = 'intro-logo-title'
  introLogoSubtext.id = 'intro-logo-subtext'
  introStart.id = 'intro-start'
  introTrack.id = 'intro-track'
  introBar.id = 'intro-bar'
  introProgress.id = 'intro-progress'
  introLogoTitle.textContent = 'hallucinate'
  introLogoSubtext.textContent = 'Massively Multiplayer Online Rave'
  introStart.type = 'button'
  introStart.textContent = 'enter'
  introProgress.textContent = '0%'

  chatForm.append(nicknameInput, chatInput, chatSubmit)
  onlineIndicator.append(chatLog, onlineCount)
  introLogo.append(introLogoTitle, introLogoSubtext)
  introTrack.append(introBar)
  introPanel.append(introLogo, introTrack, introProgress, introStart)
  intro.append(introPanel)
  document.body.prepend(canvas, djVideo, chatForm, chatBubble, onlineIndicator, reactionButtons, supportLink, intro)

  return {
    canvas,
    djVideo,
    chatForm,
    nicknameInput,
    chatInput,
    chatBubble,
    chatLog,
    onlineCount,
    onlineIndicator,
    reactionButtons,
    supportLink,
    intro,
    introBar,
    introProgress,
    introStart,
  }
}
