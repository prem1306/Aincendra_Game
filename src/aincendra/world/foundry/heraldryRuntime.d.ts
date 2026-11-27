import * as THREE from 'three';
import type { HeraldryConfig, HeraldryStats } from './types';

export interface HeraldryPart { name: string; bucket: string; start: number; count: number; grounded?: boolean; }
export interface HeraldryContact { upper: string; lower: string; }

export function createHeraldry(config: HeraldryConfig, template?: { id: string }, options?: { textures?: boolean }): THREE.Group & {
  userData: {
    stats: HeraldryStats;
    parts: HeraldryPart[];
    contacts: HeraldryContact[];
    update: (seconds: number) => void;
    dispose: () => void;
  };
};

export default createHeraldry;
