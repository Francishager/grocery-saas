export function isLoginTransportError(error: unknown): boolean {
  return error instanceof TypeError ||
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
}
