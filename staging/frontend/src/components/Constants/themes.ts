// Theme-related constants

export interface Theme {
  id: string
  name: string
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  textColor: string
  isDark: boolean
}

export interface ThemeColors {
  primary: string
  secondary: string
  success: string
  warning: string
  error: string
  info: string
}

// Default theme colors
export const defaultThemeColors: ThemeColors = {
  primary: '#2563eb', // Blue
  secondary: '#64748b', // Slate
  success: '#16a34a', // Green
  warning: '#d97706', // Amber
  error: '#dc2626', // Red
  info: '#0891b2', // Cyan
}

// Predefined themes
export const themes: Theme[] = [
  {
    id: 'light',
    name: 'Light',
    primaryColor: '#2563eb',
    secondaryColor: '#64748b',
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
    isDark: false,
  },
  {
    id: 'dark',
    name: 'Dark',
    primaryColor: '#3b82f6',
    secondaryColor: '#94a3b8',
    backgroundColor: '#0f172a',
    textColor: '#f1f5f9',
    isDark: true,
  },
  {
    id: 'green',
    name: 'Green',
    primaryColor: '#16a34a',
    secondaryColor: '#64748b',
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
    isDark: false,
  },
  {
    id: 'purple',
    name: 'Purple',
    primaryColor: '#7c3aed',
    secondaryColor: '#64748b',
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
    isDark: false,
  },
  {
    id: 'orange',
    name: 'Orange',
    primaryColor: '#ea580c',
    secondaryColor: '#64748b',
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
    isDark: false,
  },
]

// Theme options for select
export const themeOptions = themes.map((t) => ({
  value: t.id,
  label: t.name,
}))

// Color palette options
export const colorPalette = [
  { name: 'Blue', value: '#2563eb' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Purple', value: '#7c3aed' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Teal', value: '#0d9488' },
  { name: 'Indigo', value: '#4f46e5' },
]

// Font size options
export const fontSizeOptions = [
  { value: 'xs', label: 'Extra Small' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium (Default)' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra Large' },
]

// Font family options
export const fontFamilyOptions = [
  { value: 'inter', label: 'Inter' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'opensans', label: 'Open Sans' },
  { value: 'lato', label: 'Lato' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'system', label: 'System Default' },
]

// Border radius options
export const borderRadiusOptions = [
  { value: 'none', label: 'None' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra Large' },
  { value: 'full', label: 'Full' },
]

// Density options
export const densityOptions = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'spacious', label: 'Spacious' },
]

// Default theme settings
export const defaultThemeSettings = {
  theme: 'light',
  primaryColor: '#2563eb',
  fontSize: 'md',
  fontFamily: 'inter',
  borderRadius: 'md',
  density: 'comfortable',
  sidebarCollapsed: false,
  sidebarWidth: 260,
  headerFixed: true,
  footerFixed: false,
}

// Get theme by ID
export const getThemeById = (id: string): Theme | undefined => {
  return themes.find((t) => t.id === id)
}

// Generate CSS variables for theme
export const generateThemeVariables = (theme: Theme): Record<string, string> => {
  return {
    '--color-primary': theme.primaryColor,
    '--color-secondary': theme.secondaryColor,
    '--color-background': theme.backgroundColor,
    '--color-text': theme.textColor,
    '--color-surface': theme.isDark ? '#1e293b' : '#ffffff',
    '--color-border': theme.isDark ? '#334155' : '#e2e8f0',
  }
}

export default themes
