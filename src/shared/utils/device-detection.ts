/**
 * Device detection utilities for responsive game behavior
 */

/**
 * Detects if the current device is a mobile device
 * Uses a combination of touch capability, user agent, and screen size
 * @returns true if the device is mobile
 */
export function isMobileDevice(): boolean {
    // Check for touch capability
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Check for mobile user agent
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    
    // Check for small screen
    const isSmallScreen = window.innerWidth <= 768;
    
    // Return true if it's a touch device with mobile UA or small screen
    return hasTouch && (isMobileUA || isSmallScreen);
}

/**
 * Detects if the current device supports touch input
 * @returns true if the device supports touch
 */
export function isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Detects if the current device is a tablet
 * @returns true if the device is a tablet
 */
export function isTabletDevice(): boolean {
    const userAgent = navigator.userAgent.toLowerCase();
    const isTabletUA = /ipad|android(?=.*\b(?!mobile)\w)/i.test(userAgent);
    const isMediumScreen = window.innerWidth > 768 && window.innerWidth <= 1024;
    
    return isTabletUA || isMediumScreen;
}

/**
 * Gets the device type for game configuration
 * @returns 'mobile', 'tablet', or 'desktop'
 */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    if (isMobileDevice()) {
        return 'mobile';
    } else if (isTabletDevice()) {
        return 'tablet';
    } else {
        return 'desktop';
    }
}