export function parseOptionalPositiveInteger(
  value: string | undefined,
  name: string,
  defaultValue: number,
) {
  if (value === undefined || value === '') {
    return defaultValue
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer`)
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a safe positive integer`)
  }

  return parsed
}

export function parseOptionalIntegerInRange(
  value: string | undefined,
  name: string,
  defaultValue: number,
  min: number,
  max: number,
) {
  const parsed = parseOptionalPositiveInteger(value, name, defaultValue)
  if (parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}`)
  }
  return parsed
}

export function parseOptionalString(value: string | undefined, defaultValue: string) {
  return value === undefined || value === '' ? defaultValue : value
}

export function parseOptionalUrl(value: string | undefined, name: string, defaultValue: string) {
  const url = value === undefined || value === '' ? defaultValue : value

  try {
    return new URL(url).toString()
  } catch {
    throw new Error(`${name} must be a valid URL`)
  }
}
