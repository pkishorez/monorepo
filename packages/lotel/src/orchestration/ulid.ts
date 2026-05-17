const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;

let lastTime = -1;
let lastRandom: number[] = [];

const encodeTime = (time: number): string => {
  let value = time;
  const chars = Array.from({ length: TIME_LENGTH }, () => '0');
  for (let i = TIME_LENGTH - 1; i >= 0; i--) {
    chars[i] = ENCODING[value % 32]!;
    value = Math.floor(value / 32);
  }
  return chars.join('');
};

const randomChars = (): number[] => {
  const bytes = crypto.getRandomValues(new Uint8Array(RANDOM_LENGTH));
  return Array.from(bytes, (byte) => byte % 32);
};

const incrementRandom = (chars: number[]): number[] => {
  const next = chars.slice();
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i]! < 31) {
      next[i] = next[i]! + 1;
      return next;
    }
    next[i] = 0;
  }
  return next;
};

const encodeRandom = (chars: number[]): string =>
  chars.map((value) => ENCODING[value]!).join('');

export const monotonicUlid = (time = Date.now()): string => {
  if (time === lastTime) {
    lastRandom = incrementRandom(lastRandom);
  } else {
    lastTime = time;
    lastRandom = randomChars();
  }
  return `${encodeTime(time)}${encodeRandom(lastRandom)}`;
};
