export type SectionId = 'delinquency' | 'dispatch' | 'returns' | 'trials' | 'shopify' | 'clubbed' | 'customers' | 'analytics' | 'inventory';

export interface SectionTheme {
  id: SectionId;
  name: string;
  shortLabel: string;
  tagline: string;
  colorName: string;
  accentHex: string;
  // Subtle ambient radial background glow that smoothly transitions
  ambientBackground: string;
  // Tab button styling when active
  tabActiveClasses: string;
  tabInactiveHoverClasses: string;
  tabBadgeActive: string;
  // Metric summary card indicator styling
  cardActiveBorder: string;
  cardActiveBg: string;
  cardIconColor: string;
  cardIndicatorDot: string;
  // Quick context indicator pill
  contextBadge: string;
  // Search input highlight
  searchBorderFocus: string;
  // Navbar subtle accent glow
  navTopGlow: string;
}

export const SECTION_THEMES: Record<SectionId, SectionTheme> = {
  delinquency: {
    id: 'delinquency',
    name: 'Delinquency & Delays',
    shortLabel: 'Delays',
    tagline: 'Production backlog, escalation tracking & delayed order dispatch',
    colorName: 'Amber',
    accentHex: '#d97706',
    ambientBackground: `
      radial-gradient(ellipse 80% 50% at 20% -10%, rgba(245, 158, 11, 0.18), transparent 70%),
      radial-gradient(ellipse 60% 40% at 85% 5%, rgba(217, 119, 6, 0.10), transparent 60%),
      radial-gradient(ellipse 50% 30% at 50% 100%, rgba(254, 243, 199, 0.5), transparent 70%)
    `,
    tabActiveClasses: 'bg-amber-600 text-white shadow-md shadow-amber-600/25 border border-amber-500/80 ring-1 ring-amber-400/30',
    tabInactiveHoverClasses: 'hover:text-amber-800 hover:bg-amber-50/70',
    tabBadgeActive: 'bg-amber-700/60 text-amber-100 border border-amber-400/30',
    cardActiveBorder: 'border-amber-400/90 ring-2 ring-amber-400/20 shadow-xs shadow-amber-500/10',
    cardActiveBg: 'bg-gradient-to-b from-amber-50/50 to-white/90',
    cardIconColor: 'text-amber-600',
    cardIndicatorDot: 'bg-amber-500',
    contextBadge: 'bg-amber-500/12 text-amber-900 border-amber-500/25',
    searchBorderFocus: 'focus:border-amber-500 focus:ring-amber-500/20',
    navTopGlow: 'from-amber-500/30 via-amber-400/20 to-transparent'
  },
  dispatch: {
    id: 'dispatch',
    name: 'Daily Dispatch',
    shortLabel: 'Dispatch',
    tagline: 'Outbound courier fulfillment, Bluedart / DHL shipments & tracking',
    colorName: 'Cobalt',
    accentHex: '#2563eb',
    ambientBackground: `
      radial-gradient(ellipse 80% 50% at 20% -10%, rgba(37, 99, 235, 0.16), transparent 70%),
      radial-gradient(ellipse 60% 40% at 85% 5%, rgba(14, 165, 233, 0.12), transparent 60%),
      radial-gradient(ellipse 50% 30% at 50% 100%, rgba(224, 242, 254, 0.5), transparent 70%)
    `,
    tabActiveClasses: 'bg-blue-600 text-white shadow-md shadow-blue-600/25 border border-blue-500/80 ring-1 ring-blue-400/30',
    tabInactiveHoverClasses: 'hover:text-blue-800 hover:bg-blue-50/70',
    tabBadgeActive: 'bg-blue-700/60 text-blue-100 border border-blue-400/30',
    cardActiveBorder: 'border-blue-400/90 ring-2 ring-blue-400/20 shadow-xs shadow-blue-500/10',
    cardActiveBg: 'bg-gradient-to-b from-blue-50/50 to-white/90',
    cardIconColor: 'text-blue-600',
    cardIndicatorDot: 'bg-blue-500',
    contextBadge: 'bg-blue-500/12 text-blue-900 border-blue-500/25',
    searchBorderFocus: 'focus:border-blue-500 focus:ring-blue-500/20',
    navTopGlow: 'from-blue-500/30 via-blue-400/20 to-transparent'
  },
  returns: {
    id: 'returns',
    name: 'Returns & Boston Stock',
    shortLabel: 'Returns',
    tagline: 'Reverse logistics, QA refurbishment, and Boston warehouse inventory',
    colorName: 'Teal',
    accentHex: '#0d9488',
    ambientBackground: `
      radial-gradient(ellipse 80% 50% at 20% -10%, rgba(13, 148, 136, 0.16), transparent 70%),
      radial-gradient(ellipse 60% 40% at 85% 5%, rgba(20, 184, 166, 0.10), transparent 60%),
      radial-gradient(ellipse 50% 30% at 50% 100%, rgba(204, 251, 241, 0.5), transparent 70%)
    `,
    tabActiveClasses: 'bg-teal-700 text-white shadow-md shadow-teal-700/25 border border-teal-600/80 ring-1 ring-teal-400/30',
    tabInactiveHoverClasses: 'hover:text-teal-800 hover:bg-teal-50/70',
    tabBadgeActive: 'bg-teal-800/60 text-teal-100 border border-teal-400/30',
    cardActiveBorder: 'border-teal-400/90 ring-2 ring-teal-400/20 shadow-xs shadow-teal-500/10',
    cardActiveBg: 'bg-gradient-to-b from-teal-50/50 to-white/90',
    cardIconColor: 'text-teal-600',
    cardIndicatorDot: 'bg-teal-500',
    contextBadge: 'bg-teal-500/12 text-teal-900 border-teal-500/25',
    searchBorderFocus: 'focus:border-teal-500 focus:ring-teal-500/20',
    navTopGlow: 'from-teal-500/30 via-teal-400/20 to-transparent'
  },
  trials: {
    id: 'trials',
    name: 'Trial Pairs Fitting',
    shortLabel: 'Trial Pairs',
    tagline: 'Home fit trials, bespoke test sizing & return turnaround management',
    colorName: 'Violet',
    accentHex: '#7c3aed',
    ambientBackground: `
      radial-gradient(ellipse 80% 50% at 20% -10%, rgba(124, 58, 237, 0.16), transparent 70%),
      radial-gradient(ellipse 60% 40% at 85% 5%, rgba(139, 92, 246, 0.10), transparent 60%),
      radial-gradient(ellipse 50% 30% at 50% 100%, rgba(237, 233, 254, 0.5), transparent 70%)
    `,
    tabActiveClasses: 'bg-violet-700 text-white shadow-md shadow-violet-700/25 border border-violet-600/80 ring-1 ring-violet-400/30',
    tabInactiveHoverClasses: 'hover:text-violet-800 hover:bg-violet-50/70',
    tabBadgeActive: 'bg-violet-800/60 text-violet-100 border border-violet-400/30',
    cardActiveBorder: 'border-violet-400/90 ring-2 ring-violet-400/20 shadow-xs shadow-violet-500/10',
    cardActiveBg: 'bg-gradient-to-b from-violet-50/50 to-white/90',
    cardIconColor: 'text-violet-600',
    cardIndicatorDot: 'bg-violet-500',
    contextBadge: 'bg-violet-500/12 text-violet-900 border-violet-500/25',
    searchBorderFocus: 'focus:border-violet-500 focus:ring-violet-500/20',
    navTopGlow: 'from-violet-500/30 via-violet-400/20 to-transparent'
  },
  shopify: {
    id: 'shopify',
    name: 'Shopify Store Feed',
    shortLabel: 'Shopify',
    tagline: 'Live online customer purchases, checkout events & unfulfilled store orders',
    colorName: 'Emerald',
    accentHex: '#16a34a',
    ambientBackground: `
      radial-gradient(ellipse 80% 50% at 20% -10%, rgba(22, 163, 74, 0.16), transparent 70%),
      radial-gradient(ellipse 60% 40% at 85% 5%, rgba(34, 197, 94, 0.10), transparent 60%),
      radial-gradient(ellipse 50% 30% at 50% 100%, rgba(220, 252, 231, 0.5), transparent 70%)
    `,
    tabActiveClasses: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 border border-emerald-500/80 ring-1 ring-emerald-400/30',
    tabInactiveHoverClasses: 'hover:text-emerald-800 hover:bg-emerald-50/70',
    tabBadgeActive: 'bg-emerald-700/60 text-emerald-100 border border-emerald-400/30',
    cardActiveBorder: 'border-emerald-400/90 ring-2 ring-emerald-400/20 shadow-xs shadow-emerald-500/10',
    cardActiveBg: 'bg-gradient-to-b from-emerald-50/50 to-white/90',
    cardIconColor: 'text-emerald-600',
    cardIndicatorDot: 'bg-emerald-500',
    contextBadge: 'bg-emerald-500/12 text-emerald-900 border-emerald-500/25',
    searchBorderFocus: 'focus:border-emerald-500 focus:ring-emerald-500/20',
    navTopGlow: 'from-emerald-500/30 via-emerald-400/20 to-transparent'
  },
  clubbed: {
    id: 'clubbed',
    name: 'Cross-Matched Orders',
    shortLabel: 'Cross-Match',
    tagline: 'Unified correlation across Shopify storefront and Supabase production databases',
    colorName: 'Indigo',
    accentHex: '#4f46e5',
    ambientBackground: `
      radial-gradient(ellipse 80% 50% at 20% -10%, rgba(79, 70, 229, 0.16), transparent 70%),
      radial-gradient(ellipse 60% 40% at 85% 5%, rgba(99, 102, 241, 0.10), transparent 60%),
      radial-gradient(ellipse 50% 30% at 50% 100%, rgba(224, 231, 255, 0.5), transparent 70%)
    `,
    tabActiveClasses: 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 border border-indigo-500/80 ring-1 ring-indigo-400/30',
    tabInactiveHoverClasses: 'hover:text-indigo-800 hover:bg-indigo-50/70',
    tabBadgeActive: 'bg-indigo-700/60 text-indigo-100 border border-indigo-400/30',
    cardActiveBorder: 'border-indigo-400/90 ring-2 ring-indigo-400/20 shadow-xs shadow-indigo-500/10',
    cardActiveBg: 'bg-gradient-to-b from-indigo-50/50 to-white/90',
    cardIconColor: 'text-indigo-600',
    cardIndicatorDot: 'bg-indigo-500',
    contextBadge: 'bg-indigo-500/12 text-indigo-900 border-indigo-500/25',
    searchBorderFocus: 'focus:border-indigo-500 focus:ring-indigo-500/20',
    navTopGlow: 'from-indigo-500/30 via-indigo-400/20 to-transparent'
  },
  customers: {
    id: 'customers',
    name: 'CRM HUB',
    shortLabel: 'CRM HUB',
    tagline: 'Customer directory, order history lookup, inquiry resolution & CRM remarks',
    colorName: 'Teal',
    accentHex: '#0d9488',
    ambientBackground: `
      radial-gradient(ellipse 80% 50% at 20% -10%, rgba(13, 148, 136, 0.16), transparent 70%),
      radial-gradient(ellipse 60% 40% at 85% 5%, rgba(20, 184, 166, 0.12), transparent 60%),
      radial-gradient(ellipse 50% 30% at 50% 100%, rgba(204, 251, 241, 0.5), transparent 70%)
    `,
    tabActiveClasses: 'bg-teal-600 text-white shadow-md shadow-teal-600/25 border border-teal-500/80 ring-1 ring-teal-400/30',
    tabInactiveHoverClasses: 'hover:text-teal-800 hover:bg-teal-50/70',
    tabBadgeActive: 'bg-teal-700/60 text-teal-100 border border-teal-400/30',
    cardActiveBorder: 'border-teal-400/90 ring-2 ring-teal-400/20 shadow-xs shadow-teal-500/10',
    cardActiveBg: 'bg-gradient-to-b from-teal-50/50 to-white/90',
    cardIconColor: 'text-teal-600',
    cardIndicatorDot: 'bg-teal-500',
    contextBadge: 'bg-teal-500/12 text-teal-900 border-teal-500/25',
    searchBorderFocus: 'focus:border-teal-500 focus:ring-teal-500/20',
    navTopGlow: 'from-teal-500/30 via-teal-400/20 to-transparent'
  },
  analytics: {
    id: 'analytics',
    name: 'Executive Analytics',
    shortLabel: 'Analytics',
    tagline: 'Live trend intelligence across Delayed Orders, Order Stages & Customer Returns',
    colorName: 'Indigo',
    accentHex: '#6366f1',
    ambientBackground: `
      radial-gradient(ellipse 80% 50% at 20% -10%, rgba(99, 102, 241, 0.16), transparent 70%),
      radial-gradient(ellipse 60% 40% at 85% 5%, rgba(139, 92, 246, 0.12), transparent 60%),
      radial-gradient(ellipse 50% 30% at 50% 100%, rgba(238, 242, 255, 0.5), transparent 70%)
    `,
    tabActiveClasses: 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 border border-indigo-500/80 ring-1 ring-indigo-400/30',
    tabInactiveHoverClasses: 'hover:text-indigo-800 hover:bg-indigo-50/70',
    tabBadgeActive: 'bg-indigo-700/60 text-indigo-100 border border-indigo-400/30',
    cardActiveBorder: 'border-indigo-400/90 ring-2 ring-indigo-400/20 shadow-xs shadow-indigo-500/10',
    cardActiveBg: 'bg-gradient-to-b from-indigo-50/50 to-white/90',
    cardIconColor: 'text-indigo-600',
    cardIndicatorDot: 'bg-indigo-500',
    contextBadge: 'bg-indigo-500/12 text-indigo-900 border-indigo-500/25',
    searchBorderFocus: 'focus:border-indigo-500 focus:ring-indigo-500/20',
    navTopGlow: 'from-indigo-500/30 via-indigo-400/20 to-transparent'
  },
  inventory: {
    id: 'inventory',
    name: 'Warehouse Inventory',
    shortLabel: 'Inventory',
    tagline: 'Domestic (IN) & Boston (US) physical stock, rework tracking & available pairs',
    colorName: 'Amber',
    accentHex: '#d97706',
    ambientBackground: `
      radial-gradient(ellipse 80% 50% at 20% -10%, rgba(245, 158, 11, 0.16), transparent 70%),
      radial-gradient(ellipse 60% 40% at 85% 5%, rgba(217, 119, 6, 0.10), transparent 60%),
      radial-gradient(ellipse 50% 30% at 50% 100%, rgba(254, 243, 199, 0.5), transparent 70%)
    `,
    tabActiveClasses: 'bg-amber-600 text-white shadow-md shadow-amber-600/25 border border-amber-500/80 ring-1 ring-amber-400/30',
    tabInactiveHoverClasses: 'hover:text-amber-800 hover:bg-amber-50/70',
    tabBadgeActive: 'bg-amber-700/60 text-amber-100 border border-amber-400/30',
    cardActiveBorder: 'border-amber-400/90 ring-2 ring-amber-400/20 shadow-xs shadow-amber-500/10',
    cardActiveBg: 'bg-gradient-to-b from-amber-50/50 to-white/90',
    cardIconColor: 'text-amber-600',
    cardIndicatorDot: 'bg-amber-500',
    contextBadge: 'bg-amber-500/12 text-amber-900 border-amber-500/25',
    searchBorderFocus: 'focus:border-amber-500 focus:ring-amber-500/20',
    navTopGlow: 'from-amber-500/30 via-amber-400/20 to-transparent'
  }
};

export function getSectionTheme(sectionId: string): SectionTheme {
  if (sectionId in SECTION_THEMES) {
    return SECTION_THEMES[sectionId as SectionId];
  }
  return SECTION_THEMES.delinquency;
}
