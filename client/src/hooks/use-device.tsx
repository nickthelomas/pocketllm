import * as React from "react"

export type DeviceType = "mobile" | "tablet" | "desktop"

const MOBILE_BREAKPOINT = 768
const DESKTOP_BREAKPOINT = 1024

export function useDevice() {
  const [deviceType, setDeviceType] = React.useState<DeviceType | undefined>(undefined)
  const [windowWidth, setWindowWidth] = React.useState<number | undefined>(undefined)

  React.useEffect(() => {
    const updateDevice = () => {
      const width = window.innerWidth
      setWindowWidth(width)
      
      if (width < MOBILE_BREAKPOINT) {
        setDeviceType("mobile")
      } else if (width < DESKTOP_BREAKPOINT) {
        setDeviceType("tablet")
      } else {
        setDeviceType("desktop")
      }
    }

    // Initial check
    updateDevice()

    // Listen for window resize
    window.addEventListener("resize", updateDevice)
    return () => window.removeEventListener("resize", updateDevice)
  }, [])

  return {
    deviceType: deviceType || "desktop",
    isMobile: deviceType === "mobile",
    isTablet: deviceType === "tablet",
    isDesktop: deviceType === "desktop",
    isMobileOrTablet: deviceType === "mobile" || deviceType === "tablet",
    windowWidth: windowWidth || 0
  }
}

// Backward compatibility wrapper for existing useIsMobile hook
export function useIsMobile() {
  const { isMobile } = useDevice()
  return isMobile
}