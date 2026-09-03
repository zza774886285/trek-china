import { useState } from 'react'
import { emojiToCodepoint } from './CollabChat.helpers'

export function TwemojiImg({ emoji, size = 20, style = {} }) {
  // Use native emoji rendering (no external CDN dependency)
  return (
    <span style={{ fontSize: size, lineHeight: 1, display: 'inline-block', verticalAlign: 'middle', ...style }}>
      {emoji}
    </span>
  )
}
