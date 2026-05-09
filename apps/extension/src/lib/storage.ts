type SupabaseStorage = {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export const chromeLocalStorage: SupabaseStorage = {
  async getItem(key) {
    const result = await chrome.storage.local.get(key)
    const value = result[key]
    return typeof value === 'string' ? value : null
  },
  async setItem(key, value) {
    await chrome.storage.local.set({ [key]: value })
  },
  async removeItem(key) {
    await chrome.storage.local.remove(key)
  },
}
