// Presets for the emulate tool: devices (CSS px, like DevTools device mode) and network throttling.

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
export type Device = { width: number; height: number; deviceScaleFactor: number; mobile: boolean; ua?: string };
export const DEVICES: Record<string, Device> = {
  'iphone-15': { width: 393, height: 852, deviceScaleFactor: 3, mobile: true, ua: IOS_UA },
  'iphone-se': { width: 375, height: 667, deviceScaleFactor: 2, mobile: true, ua: IOS_UA },
  'pixel-8': { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true, ua: ANDROID_UA },
  ipad: { width: 820, height: 1180, deviceScaleFactor: 2, mobile: true, ua: IOS_UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS') },
  laptop: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
};
// Network presets (DevTools values): latency ms, throughput bytes/s.
export type NetworkPreset = { offline: boolean; latency: number; downloadThroughput: number; uploadThroughput: number };
export const NETWORKS: Record<string, NetworkPreset> = {
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
  'slow-3g': { offline: false, latency: 2000, downloadThroughput: ((500 * 1024) / 8) * 0.8, uploadThroughput: ((500 * 1024) / 8) * 0.8 },
  'fast-3g': { offline: false, latency: 563, downloadThroughput: ((1.6 * 1024 * 1024) / 8) * 0.9, uploadThroughput: ((750 * 1024) / 8) * 0.9 },
  '4g': { offline: false, latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
  none: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
};
