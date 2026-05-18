export type InteractionInfo = {
  type: string
  target: string
  trusted: boolean
  clientX?: number
  clientY?: number
  screenX?: number
  screenY?: number
  pointerType?: string
  capturedAt: string
}

export type ClientReport = {
  capturedAt: string
  interaction?: InteractionInfo
  form: {
    username: string
    password: string
  }
  page: {
    url: string
    referrer: string
    title: string
    secureContext: boolean
    visibilityState: DocumentVisibilityState
    historyLength: number
  }
  browser: {
    userAgent: string
    platform: string
    vendor: string
    language: string
    languages: string[]
    cookieEnabled: boolean
    doNotTrack: string | null
    webdriver: boolean
    timezone: string
    timezoneOffsetMinutes: number
  }
  userAgentData: {
    status: string
    brands?: Array<{ brand: string; version: string }>
    mobile?: boolean
    platform?: string
    highEntropy?: Record<string, unknown>
    error?: string
  }
  device: {
    hardwareConcurrency?: number
    deviceMemory?: number
    maxTouchPoints: number
    touchSupport: boolean
  }
  screen: {
    width: number
    height: number
    availWidth: number
    availHeight: number
    colorDepth: number
    pixelDepth: number
    devicePixelRatio: number
    viewportWidth: number
    viewportHeight: number
    orientation: string
  }
  network: {
    online: boolean
    type?: string
    effectiveType?: string
    downlink?: number
    rtt?: number
    saveData?: boolean
  }
  permissions: Record<string, string>
  location: {
    status: string
    latitude?: number
    longitude?: number
    accuracy?: number
    altitude?: number | null
    speed?: number | null
    heading?: number | null
    error?: string
  }
  clipboard: {
    status: string
    text?: string
    length?: number
    error?: string
  }
  battery: {
    status: string
    charging?: boolean
    level?: number
    chargingTime?: number
    dischargingTime?: number
    error?: string
  }
}

type NetworkInfo = {
  type?: string
  effectiveType?: string
  downlink?: number
  rtt?: number
  saveData?: boolean
}

type BatteryInfo = {
  charging: boolean
  level: number
  chargingTime: number
  dischargingTime: number
}

type UserAgentData = {
  brands?: Array<{ brand: string; version: string }>
  mobile?: boolean
  platform?: string
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

async function queryPermission(name: string): Promise<[string, string]> {
  if (!navigator.permissions?.query) return [name, 'unsupported']

  try {
    const status = await navigator.permissions.query({ name: name as PermissionName })
    return [name, status.state]
  } catch (error) {
    return [name, `unsupported: ${errorMessage(error)}`]
  }
}

async function collectPermissions(): Promise<Record<string, string>> {
  const names = [
    'geolocation',
    'notifications',
    'camera',
    'microphone',
    'clipboard-read',
    'clipboard-write'
  ]
  return Object.fromEntries(await Promise.all(names.map(queryPermission)))
}

async function readClipboard() {
  if (!window.isSecureContext) {
    return { status: 'blocked', error: 'requires HTTPS or localhost' }
  }
  if (!navigator.clipboard?.readText) {
    return { status: 'unsupported' }
  }

  try {
    const text = await navigator.clipboard.readText()
    return { status: 'granted', text, length: text.length }
  } catch (error) {
    return { status: 'denied', error: errorMessage(error) }
  }
}

async function readLocation() {
  if (!navigator.geolocation) return { status: 'unsupported' }

  return new Promise<ClientReport['location']>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          status: 'granted',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          speed: position.coords.speed,
          heading: position.coords.heading
        })
      },
      (error) => {
        resolve({
          status: 'denied',
          error: `${error.code}: ${error.message}`
        })
      },
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 30000 }
    )
  })
}

async function readBattery(): Promise<ClientReport['battery']> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryInfo> }
  if (!nav.getBattery) return { status: 'unsupported' }

  try {
    const battery = await nav.getBattery()
    return {
      status: 'available',
      charging: battery.charging,
      level: battery.level,
      chargingTime: battery.chargingTime,
      dischargingTime: battery.dischargingTime
    }
  } catch (error) {
    return { status: 'error', error: errorMessage(error) }
  }
}

async function readUserAgentData(): Promise<ClientReport['userAgentData']> {
  const nav = navigator as Navigator & { userAgentData?: UserAgentData }
  const userAgentData = nav.userAgentData
  if (!userAgentData) return { status: 'unsupported' }

  try {
    const highEntropy = userAgentData.getHighEntropyValues
      ? await userAgentData.getHighEntropyValues([
        'architecture',
        'bitness',
        'model',
        'platformVersion',
        'uaFullVersion',
        'fullVersionList'
      ])
      : undefined

    return {
      status: 'available',
      brands: userAgentData.brands,
      mobile: userAgentData.mobile,
      platform: userAgentData.platform,
      highEntropy
    }
  } catch (error) {
    return {
      status: 'error',
      brands: userAgentData.brands,
      mobile: userAgentData.mobile,
      platform: userAgentData.platform,
      error: errorMessage(error)
    }
  }
}

function getConnection(): NetworkInfo | undefined {
  const nav = navigator as Navigator & {
    connection?: NetworkInfo
    mozConnection?: NetworkInfo
    webkitConnection?: NetworkInfo
  }
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection
}

export async function collectClientReport(input: {
  username: string
  password: string
  interaction?: InteractionInfo
}): Promise<ClientReport> {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const connection = getConnection()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const [permissions, location, clipboard, battery, userAgentData] = await Promise.all([
    collectPermissions(),
    readLocation(),
    readClipboard(),
    readBattery(),
    readUserAgentData()
  ])

  return {
    capturedAt: new Date().toISOString(),
    interaction: input.interaction,
    form: {
      username: input.username,
      password: input.password
    },
    page: {
      url: window.location.href,
      referrer: document.referrer,
      title: document.title,
      secureContext: window.isSecureContext,
      visibilityState: document.visibilityState,
      historyLength: window.history.length
    },
    browser: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      language: navigator.language,
      languages: [...navigator.languages],
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      webdriver: navigator.webdriver,
      timezone,
      timezoneOffsetMinutes: new Date().getTimezoneOffset()
    },
    userAgentData,
    device: {
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: nav.deviceMemory,
      maxTouchPoints: navigator.maxTouchPoints,
      touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      colorDepth: window.screen.colorDepth,
      pixelDepth: window.screen.pixelDepth,
      devicePixelRatio: window.devicePixelRatio,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      orientation: window.screen.orientation?.type ?? 'unknown'
    },
    network: {
      online: navigator.onLine,
      type: connection?.type,
      effectiveType: connection?.effectiveType,
      downlink: connection?.downlink,
      rtt: connection?.rtt,
      saveData: connection?.saveData
    },
    permissions,
    location,
    clipboard,
    battery
  }
}
