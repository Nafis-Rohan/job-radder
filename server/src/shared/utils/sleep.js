export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wait a random time between min and max milliseconds (be polite to the sites we read).
export function randomSleep(minMs = 2000, maxMs = 4000) {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}
