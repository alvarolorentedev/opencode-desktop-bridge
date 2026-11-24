"use strict"

function createSseReader(onFrame) {
  let buffer = ""
  return {
    push(chunk) {
      buffer += chunk.toString("utf8")
      for (;;) {
        const match = /\r?\n\r?\n/.exec(buffer)
        if (!match) break
        const frame = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        if (frame) onFrame(frame)
      }
      if (buffer.length > 1024 * 1024) buffer = ""
    },
    end() {
      if (buffer.trim()) onFrame(buffer)
      buffer = ""
    },
  }
}

function frameFromEvent(event) {
  return `data: ${JSON.stringify(event)}`
}

function writeFrame(res, frame) {
  if (res.destroyed || res.writableEnded) return false
  const ok = res.write(`${frame}\n\n`)
  if (res.writableLength > 2 * 1024 * 1024) {
    res.destroy()
    return false
  }
  return ok
}

module.exports = { createSseReader, frameFromEvent, writeFrame }
