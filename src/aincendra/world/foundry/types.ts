export type HeraldryFamily = 'standards' | 'hangings' | 'regalia' | 'civic';
export type HeraldryVariant =
  | 'standard'
  | 'banner'
  | 'pennant'
  | 'hanging'
  | 'tapestry'
  | 'shield'
  | 'tabard'
  | 'bunting'
  | 'sign';

export interface HeraldryConfig {
  variant?: HeraldryVariant;
  family?: HeraldryFamily;
  width?: number;
  depth?: number;
  height?: number;
  detail?: number;
  wear?: number;
  wind?: number;
  roughness?: number;
  seed?: number;
  primaryColor?: string;
  secondaryColor?: string;
  trimColor?: string;
  woodColor?: string;
  metalColor?: string;
  sigil?: 'crown' | 'eagle' | 'lion' | 'stag' | 'cross' | 'tower' | 'fleur' | 'sun' | 'none';
  pattern?: 'plain' | 'pale' | 'chevron' | 'quartered' | 'fess';
  tassels?: boolean;
  lighting?: string;
  groundType?: string;
}

export interface HeraldryStats {
  triangles?: number;
  drawCalls?: number;
  [key: string]: unknown;
}

export type StatueFamily = 'pedestals' | 'crosses' | 'tombs' | 'monuments';
export type StatueVariant =
  | 'marble-pedestal'
  | 'royal-plinth'
  | 'broken-effigy'
  | 'sword-memorial'
  | 'wayside-cross'
  | 'wheel-cross'
  | 'knight-tomb'
  | 'ledger-tomb'
  | 'obelisk'
  | 'cenotaph'
  | 'victory-column'
  | 'eternal-brazier';

export interface StatueConfig {
  family?: StatueFamily;
  variant?: StatueVariant;
  width?: number;
  depth?: number;
  height?: number;
  weathering?: number;
  detail?: number;
  carving?: number;
  lichen?: number;
  inscriptions?: boolean;
  offerings?: boolean;
  flame?: boolean;
  roughness?: number;
  stoneColor?: string;
  trimColor?: string;
  metalColor?: string;
  lichenColor?: string;
  glowColor?: string;
  seed?: number;
  lighting?: string;
  groundType?: string;
}

export interface StatueTemplate {
  id: string;
  name?: string;
  defaults?: Partial<StatueConfig>;
}

export interface StatueStats {
  triangles?: number;
  drawCalls?: number;
  [key: string]: unknown;
}
