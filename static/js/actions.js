export const ACTION_REGISTRY = {
  actions: new Map(),
  inputs: new Map(),
  changes: new Map()
}

export function registerAction(name, handler) {
  if (typeof name !== 'string') {
    console.error(`[ActionRegistry] Action name must be a string, got ${typeof name}`)
    return
  }
  if (typeof handler !== 'function') {
    console.error(`[ActionRegistry] Handler must be a function for action "${name}"`)
    return
  }
  ACTION_REGISTRY.actions.set(name, handler)
}

export function registerInput(name, handler) {
  if (typeof name !== 'string') {
    console.error(`[ActionRegistry] Input name must be a string, got ${typeof name}`)
    return
  }
  if (typeof handler !== 'function') {
    console.error(`[ActionRegistry] Handler must be a function for input "${name}"`)
    return
  }
  ACTION_REGISTRY.inputs.set(name, handler)
}

export function registerChange(name, handler) {
  if (typeof name !== 'string') {
    console.error(`[ActionRegistry] Change name must be a string, got ${typeof name}`)
    return
  }
  if (typeof handler !== 'function') {
    console.error(`[ActionRegistry] Handler must be a function for change "${name}"`)
    return
  }
  ACTION_REGISTRY.changes.set(name, handler)
}

export function getAction(name) {
  return ACTION_REGISTRY.actions.get(name)
}

export function getInput(name) {
  return ACTION_REGISTRY.inputs.get(name)
}

export function getChange(name) {
  return ACTION_REGISTRY.changes.get(name)
}

export function hasAction(name) {
  return ACTION_REGISTRY.actions.has(name)
}

export function hasInput(name) {
  return ACTION_REGISTRY.inputs.has(name)
}

export function hasChange(name) {
  return ACTION_REGISTRY.changes.has(name)
}

export function unregisterAction(name) {
  ACTION_REGISTRY.actions.delete(name)
}

export function unregisterInput(name) {
  ACTION_REGISTRY.inputs.delete(name)
}

export function unregisterChange(name) {
  ACTION_REGISTRY.changes.delete(name)
}

export function clearRegistry() {
  ACTION_REGISTRY.actions.clear()
  ACTION_REGISTRY.inputs.clear()
  ACTION_REGISTRY.changes.clear()
}

export function getRegisteredActions() {
  return Array.from(ACTION_REGISTRY.actions.keys())
}

export function getRegisteredInputs() {
  return Array.from(ACTION_REGISTRY.inputs.keys())
}

export function getRegisteredChanges() {
  return Array.from(ACTION_REGISTRY.changes.keys())
}
