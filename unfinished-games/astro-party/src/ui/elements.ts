const getElement = <T extends HTMLElement>(id: string): T => {
  return document.getElementById(id) as T;
};

export const elements = {
  // Screens
  startScreen: getElement<HTMLElement>("startScreen"),
  lobbyScreen: getElement<HTMLElement>("lobbyScreen"),
  gameEndScreen: getElement<HTMLElement>("gameEndScreen"),

  // Start screen
  mainButtons: getElement<HTMLElement>("mainButtons"),
  joinSection: getElement<HTMLElement>("joinSection"),
  createRoomBtn: getElement<HTMLButtonElement>("createRoomBtn"),
  joinRoomBtn: getElement<HTMLButtonElement>("joinRoomBtn"),
  roomCodeInput: getElement<HTMLInputElement>("roomCodeInput"),
  joinError: getElement<HTMLElement>("joinError"),
  submitJoinBtn: getElement<HTMLButtonElement>("submitJoinBtn"),
  backToStartBtn: getElement<HTMLButtonElement>("backToStartBtn"),

  // Lobby screen
  roomCodeDisplay: getElement<HTMLElement>("roomCodeDisplay"),
  copyCodeBtn: getElement<HTMLButtonElement>("copyCodeBtn"),
  playersList: getElement<HTMLElement>("playersList"),
  lobbyStatus: getElement<HTMLElement>("lobbyStatus"),
  startGameBtn: getElement<HTMLButtonElement>("startGameBtn"),
  leaveLobbyBtn: getElement<HTMLButtonElement>("leaveLobbyBtn"),

  // Game end screen
  winnerName: getElement<HTMLElement>("winnerName"),
  finalScores: getElement<HTMLElement>("finalScores"),
  playAgainBtn: getElement<HTMLButtonElement>("playAgainBtn"),
  leaveEndBtn: getElement<HTMLButtonElement>("leaveEndBtn"),

  // HUD
  hud: getElement<HTMLElement>("hud"),
  scoreTrack: getElement<HTMLElement>("scoreTrack"),
  leaveGameBtn: getElement<HTMLButtonElement>("leaveGameBtn"),
  settingsCenterHotspot: getElement<HTMLButtonElement>("settingsCenterHotspot"),

  // Leave confirmation modal
  leaveModal: getElement<HTMLElement>("leaveModal"),
  leaveBackdrop: getElement<HTMLElement>("leaveBackdrop"),
  leaveCancelBtn: getElement<HTMLButtonElement>("leaveCancelBtn"),
  leaveConfirmBtn: getElement<HTMLButtonElement>("leaveConfirmBtn"),

  // Settings
  settingsBtn: getElement<HTMLButtonElement>("settingsBtn"),
  settingsModal: getElement<HTMLElement>("settingsModal"),
  settingsLeaveBtn: getElement<HTMLButtonElement>("settingsLeaveBtn"),
  settingsBackdrop: getElement<HTMLElement>("settingsBackdrop"),
  toggleMusic: getElement<HTMLElement>("toggleMusic"),
  toggleFx: getElement<HTMLElement>("toggleFx"),
  toggleHaptics: getElement<HTMLElement>("toggleHaptics"),
  settingsClose: getElement<HTMLButtonElement>("settingsClose"),

  // Round result overlay
  roundResult: getElement<HTMLElement>("roundResult"),
  roundResultTitle: getElement<HTMLElement>("roundResultTitle"),
  roundResultSubtitle: getElement<HTMLElement>("roundResultSubtitle"),

  // Bot controls
  addBotSection: getElement<HTMLElement>("addBotSection"),
  addAIBotBtn: getElement<HTMLButtonElement>("addAIBotBtn"),
  addLocalPlayerBtn: getElement<HTMLButtonElement>("addLocalPlayerBtn"),
  advancedSettingsBtn: getElement<HTMLButtonElement>("advancedSettingsBtn"),

  // Game mode toggle
  gameModeSection: getElement<HTMLElement>("gameModeSection"),
  modeStandard: getElement<HTMLButtonElement>("modeStandard"),
  modeChaotic: getElement<HTMLButtonElement>("modeChaotic"),
  modeSane: getElement<HTMLButtonElement>("modeSane"),

  // Key selection modal
  keySelectModal: getElement<HTMLElement>("keySelectModal"),
  keySelectBackdrop: getElement<HTMLElement>("keySelectBackdrop"),
  keyOptions: getElement<HTMLElement>("keyOptions"),
  keySelectCancel: getElement<HTMLButtonElement>("keySelectCancel"),

  // Ping indicator
  pingIndicator: getElement<HTMLElement>("pingIndicator"),

  // Mobile controls
  mobileControls: getElement<HTMLElement>("mobileControls"),
} as const;
