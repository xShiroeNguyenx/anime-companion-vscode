// Streams `data:` payloads out of an SSE response body. The payload text is
// yielded per event — callers JSON.parse + extract provider-specific fields.
// Stops naturally when the underlying stream ends or `signal` aborts the
// upstream fetch (the body reader will reject and bubble out).
//
// Handles both LF (`\n\n`) and CRLF (`\r\n\r\n`) event boundaries since
// different providers (and even different proxies in front of the same
// provider) pick different conventions.
export async function* parseSSE(resp: Response): AsyncIterable<string> {
  if (!resp.body) return;

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line. Normalize CRLF → LF first
      // so the splitter only needs to look for `\n\n`.
      buffer = buffer.replace(/\r\n/g, '\n');

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const dataLines: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).replace(/^ /, ''));
          }
        }
        if (dataLines.length > 0) {
          yield dataLines.join('\n');
        }
      }
    }

    // Flush trailing event if the server didn't terminate with a blank line.
    if (buffer.trim()) {
      const dataLines: string[] = [];
      for (const line of buffer.split('\n')) {
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }
      if (dataLines.length > 0) {
        yield dataLines.join('\n');
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore — reader may already be closed
    }
  }
}
