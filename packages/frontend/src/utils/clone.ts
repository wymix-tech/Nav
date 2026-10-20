// Dashboard and local persistence records are JSON data, including Vue proxies.
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
