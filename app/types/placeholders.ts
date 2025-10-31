export interface PlaceholderInfo {
  key: string // Normalized key (e.g., "Company Name")
  originalFormat: string // Original format from document (e.g., "[Company Name]")
  prefix: string // Any prefix like "$" or currency symbols
  type: 'square' | 'curly' | 'double-curly' | 'angle' | 'currency-blank'
  context?: 'company' | 'investor' // Context for label-based fields
  position?: number // Position in document for context-aware replacement
}

export interface PlaceholderData {
  info: PlaceholderInfo
  value: string
}

