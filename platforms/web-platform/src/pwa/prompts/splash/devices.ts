// Every iOS screen the Splash is drawn for, in portrait points. Screens
// that share a size and scale share a row. iPhones open in portrait only;
// an iPad opens either way, so it gets both.
export const PHONES = [
  { width: 440, height: 956, scale: 3 }, // 16 Pro Max, 17 Pro Max
  { width: 430, height: 932, scale: 3 }, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { width: 428, height: 926, scale: 3 }, // 12 Pro Max, 13 Pro Max, 14 Plus
  { width: 420, height: 912, scale: 3 }, // Air
  { width: 414, height: 896, scale: 3 }, // XS Max, 11 Pro Max
  { width: 414, height: 896, scale: 2 }, // XR, 11
  { width: 402, height: 874, scale: 3 }, // 16 Pro, 17, 17 Pro
  { width: 393, height: 852, scale: 3 }, // 14 Pro, 15, 15 Pro, 16
  { width: 390, height: 844, scale: 3 }, // 12, 13, 14, 16e
  { width: 375, height: 812, scale: 3 }, // X, XS, 11 Pro, 12 mini, 13 mini
  { width: 375, height: 667, scale: 2 }, // SE (2nd and 3rd), 8
] as const;

export const TABLETS = [
  { width: 1032, height: 1376, scale: 2 }, // Pro 13" (M4)
  { width: 1024, height: 1366, scale: 2 }, // Pro 12.9"
  { width: 834, height: 1210, scale: 2 }, // Pro 11" (M4)
  { width: 834, height: 1194, scale: 2 }, // Pro 11", Air 11"
  { width: 834, height: 1112, scale: 2 }, // Air 10.5"
  { width: 820, height: 1180, scale: 2 }, // Air 10.9", 10th and 11th gen
  { width: 810, height: 1080, scale: 2 }, // 7th to 9th gen
  { width: 768, height: 1024, scale: 2 }, // mini 5th gen
  { width: 744, height: 1133, scale: 2 }, // mini 6th gen and later
] as const;
