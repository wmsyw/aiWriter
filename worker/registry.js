const handlers = new Map();

export function registerHandler(jobType, handler) {
  handlers.set(jobType, handler);
}

export function getHandler(jobType) {
  return handlers.get(jobType);
}

export function getAllRegisteredTypes() {
  return Array.from(handlers.keys());
}
