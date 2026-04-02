import type { EncryptedValue } from './types.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function getDataKey(rawKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(rawKey), (character) => character.charCodeAt(0)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  )
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

export async function encryptMap(values: Record<string, string> | undefined, rawKey: string) {
  const encrypted: Record<string, EncryptedValue> = {}
  if (!values) return encrypted

  const key = await getDataKey(rawKey)
  for (const [name, value] of Object.entries(values)) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(value),
    )
    encrypted[name] = {
      ciphertext: toBase64(new Uint8Array(ciphertext)),
      iv: toBase64(iv),
    }
  }
  return encrypted
}

export async function decryptMap(values: Record<string, EncryptedValue> | undefined, rawKey: string) {
  const decrypted: Record<string, string> = {}
  if (!values) return decrypted

  const key = await getDataKey(rawKey)
  for (const [name, value] of Object.entries(values)) {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(value.iv),
      },
      key,
      fromBase64(value.ciphertext),
    )
    decrypted[name] = decoder.decode(plaintext)
  }
  return decrypted
}
